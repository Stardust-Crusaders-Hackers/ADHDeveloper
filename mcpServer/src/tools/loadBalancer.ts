export interface LoadBalancerTask {
  id: string;
  agentName: string;
  query: string;
  dependencies?: string[];
  estimatedCostTokens?: number;
  estimatedTimeMs?: number;
  failureRisk?: number;
  resultImpact?: number;
  critical?: boolean;
  metadata?: Record<string, unknown>;
}

interface NormalizedTask {
  id: string;
  agentName: string;
  query: string;
  dependencies: string[];
  estimatedCostTokens: number;
  estimatedTimeMs: number;
  failureRisk: number;
  resultImpact: number;
  critical: boolean;
  metadata?: Record<string, unknown>;
}

export interface ScheduledTask {
  id: string;
  agentName: string;
  query: string;
  estimatedCostTokens: number;
  estimatedTimeMs: number;
  failureRisk: number;
  resultImpact: number;
  critical: boolean;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPhase {
  phaseIndex: number;
  mode: "parallel" | "sequential";
  tasks: ScheduledTask[];
  phaseEstimatedCostTokens: number;
  phaseEstimatedTimeMs: number;
  reasoning: string;
}

export interface LoadBalancerPlan {
  valid: boolean;
  error?: string;
  phases: ExecutionPhase[];
  totalPhases: number;
  estimatedTotalCostTokens: number;
  estimatedTotalTimeMs: number;
  sequentialBaselineTimeMs: number;
  parallelSavingsMs: number;
  criticalPath: string[];
  warnings: string[];
  summary: string;
}

const DEFAULT_COST = 500;
const DEFAULT_TIME = 2000;
const DEFAULT_RISK = 0.1;
const DEFAULT_IMPACT = 0.5;

function normalize(task: LoadBalancerTask): NormalizedTask {
  return {
    id: task.id,
    agentName: task.agentName,
    query: task.query,
    dependencies: task.dependencies ?? [],
    estimatedCostTokens: task.estimatedCostTokens ?? DEFAULT_COST,
    estimatedTimeMs: task.estimatedTimeMs ?? DEFAULT_TIME,
    failureRisk: Math.min(1, Math.max(0, task.failureRisk ?? DEFAULT_RISK)),
    resultImpact: Math.min(1, Math.max(0, task.resultImpact ?? DEFAULT_IMPACT)),
    critical: task.critical ?? false,
    metadata: task.metadata,
  };
}

function computeCriticalPath(tasks: NormalizedTask[]): string[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const memo = new Map<string, number>();

  function dp(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const task = taskMap.get(id)!;
    const depMax = task.dependencies.length === 0
      ? 0
      : Math.max(...task.dependencies.map(dep => dp(dep)));
    const val = depMax + task.estimatedTimeMs;
    memo.set(id, val);
    return val;
  }

  for (const t of tasks) dp(t.id);

  const end = tasks.reduce((best, t) =>
    (memo.get(t.id) ?? 0) > (memo.get(best.id) ?? 0) ? t : best
  );

  const path: string[] = [];
  let current: NormalizedTask | undefined = end;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.id);
    if (current.dependencies.length === 0) break;
    const bestDepId = current.dependencies.reduce((best, dep) =>
      (memo.get(dep) ?? 0) > (memo.get(best) ?? 0) ? dep : best
    );
    current = taskMap.get(bestDepId);
  }

  return path;
}

function decideParallelism(tasks: NormalizedTask[]): { parallel: boolean; reason: string } {
  if (tasks.length === 1) return { parallel: false, reason: "single task — no parallelism needed" };

  const times = tasks.map(t => t.estimatedTimeMs);
  const costs = tasks.map(t => t.estimatedCostTokens);
  const sumTime = times.reduce((a, b) => a + b, 0);
  const maxTime = Math.max(...times);
  const timeSavings = sumTime - maxTime;
  const timeSavingsPct = sumTime > 0 ? timeSavings / sumTime : 0;
  const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const hasCritical = tasks.some(t => t.critical);
  const maxRisk = Math.max(...tasks.map(t => t.failureRisk));

  // Rule 3: critical + high risk → sequential for safety
  if (hasCritical && maxRisk > 0.6) {
    return {
      parallel: false,
      reason: `critical task present with high failure risk (${pct(maxRisk)}%) — sequential for safety`,
    };
  }

  // Rule 4: cheap + low time savings → sequential to minimize cost
  if (timeSavingsPct < 0.2 && avgCost < 500) {
    return {
      parallel: false,
      reason: `low time savings (${pct(timeSavingsPct)}%) and cheap tasks (avg ${avgCost} tokens) — sequential minimizes cost`,
    };
  }

  // Rule 6: too many agents, low benefit → sequential
  if (tasks.length > 5 && timeSavingsPct < 0.3) {
    return {
      parallel: false,
      reason: `${tasks.length} agents with only ${pct(timeSavingsPct)}% time savings — no clear benefit to parallelism`,
    };
  }

  // Rule 5: independent + costly → parallelize to minimize time
  if (avgCost >= 500 && timeSavingsPct >= 0.2) {
    return {
      parallel: true,
      reason: `costly independent tasks (avg ${Math.round(avgCost)} tokens) with ${pct(timeSavingsPct)}% time savings — parallelize`,
    };
  }

  // Rule 2: non-critical + meaningful savings → parallelize
  if (!hasCritical && timeSavingsPct >= 0.15) {
    return {
      parallel: true,
      reason: `non-critical independent tasks with ${pct(timeSavingsPct)}% time savings — parallelize`,
    };
  }

  // Rule 2: significant savings even with critical tasks → parallelize
  if (timeSavingsPct >= 0.4) {
    return {
      parallel: true,
      reason: `significant time savings (${pct(timeSavingsPct)}%) justify parallelism despite critical tasks`,
    };
  }

  return {
    parallel: false,
    reason: `insufficient benefit to parallelize (${pct(timeSavingsPct)}% savings, critical=${hasCritical})`,
  };
}

function pct(n: number): string {
  return (n * 100).toFixed(0);
}

function buildPhase(
  index: number,
  mode: "parallel" | "sequential",
  tasks: NormalizedTask[],
  reasoning: string,
  taskReasons: Map<string, string>
): ExecutionPhase {
  const scheduled: ScheduledTask[] = tasks.map(t => ({
    id: t.id,
    agentName: t.agentName,
    query: t.query,
    estimatedCostTokens: t.estimatedCostTokens,
    estimatedTimeMs: t.estimatedTimeMs,
    failureRisk: t.failureRisk,
    resultImpact: t.resultImpact,
    critical: t.critical,
    reason: taskReasons.get(t.id) ?? reasoning,
    metadata: t.metadata,
  }));

  const times = tasks.map(t => t.estimatedTimeMs);
  const phaseTime = mode === "parallel"
    ? Math.max(...times)
    : times.reduce((a, b) => a + b, 0);

  return {
    phaseIndex: index,
    mode,
    tasks: scheduled,
    phaseEstimatedCostTokens: tasks.reduce((s, t) => s + t.estimatedCostTokens, 0),
    phaseEstimatedTimeMs: phaseTime,
    reasoning,
  };
}

export function planExecution(tasks: LoadBalancerTask[]): LoadBalancerPlan {
  const blank = (): LoadBalancerPlan => ({
    valid: false,
    phases: [],
    totalPhases: 0,
    estimatedTotalCostTokens: 0,
    estimatedTotalTimeMs: 0,
    sequentialBaselineTimeMs: 0,
    parallelSavingsMs: 0,
    criticalPath: [],
    warnings: [],
    summary: "",
  });

  if (tasks.length === 0) {
    return { ...blank(), error: "No tasks provided" };
  }

  const ids = tasks.map(t => t.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    return { ...blank(), error: "Duplicate task IDs detected" };
  }

  const normalized = tasks.map(normalize);
  const taskMap = new Map(normalized.map(t => [t.id, t]));

  for (const task of normalized) {
    for (const dep of task.dependencies) {
      if (!idSet.has(dep)) {
        return { ...blank(), error: `Task "${task.id}" depends on unknown task "${dep}"` };
      }
      if (dep === task.id) {
        return { ...blank(), error: `Task "${task.id}" has a self-dependency` };
      }
    }
  }

  // Topological sort — Kahn's algorithm
  const inDegree = new Map<string, number>(normalized.map(t => [t.id, t.dependencies.length]));
  const dependents = new Map<string, string[]>(normalized.map(t => [t.id, []]));
  for (const task of normalized) {
    for (const dep of task.dependencies) {
      dependents.get(dep)!.push(task.id);
    }
  }

  const levels: string[][] = [];
  let queue = normalized.filter(t => t.dependencies.length === 0).map(t => t.id);

  while (queue.length > 0) {
    levels.push([...queue]);
    const next: string[] = [];
    for (const id of queue) {
      for (const dep of dependents.get(id) ?? []) {
        const deg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, deg);
        if (deg === 0) next.push(dep);
      }
    }
    queue = next;
  }

  if (levels.flat().length !== tasks.length) {
    return { ...blank(), error: "Circular dependency detected in task graph" };
  }

  const warnings: string[] = [];
  const phases: ExecutionPhase[] = [];

  for (const level of levels) {
    const levelTasks = level.map(id => taskMap.get(id)!);
    const taskReasons = new Map<string, string>();

    if (levelTasks.length === 1) {
      const t = levelTasks[0];
      taskReasons.set(t.id, "only task at this dependency level");
      phases.push(buildPhase(phases.length, "sequential", levelTasks, "single task — no parallelism needed", taskReasons));
      continue;
    }

    const { parallel, reason } = decideParallelism(levelTasks);

    if (parallel) {
      for (const t of levelTasks) taskReasons.set(t.id, reason);
      phases.push(buildPhase(phases.length, "parallel", levelTasks, reason, taskReasons));
    } else {
      // Sequential: critical first, then by impact desc, then by cost desc
      const sorted = [...levelTasks].sort((a, b) => {
        if (a.critical !== b.critical) return b.critical ? 1 : -1;
        const impactDiff = b.resultImpact - a.resultImpact;
        if (Math.abs(impactDiff) > 0.05) return impactDiff;
        return b.estimatedTimeMs - a.estimatedTimeMs;
      });
      for (const t of sorted) {
        taskReasons.set(t.id, reason);
        phases.push(buildPhase(phases.length, "sequential", [t], reason, taskReasons));
      }
    }
  }

  // Warnings for risky tasks
  for (const t of normalized) {
    if (t.failureRisk > 0.7 && !t.critical) {
      warnings.push(`Task "${t.id}": high failure risk (${pct(t.failureRisk)}%) on non-critical task — consider adding retry logic`);
    }
    if (t.resultImpact > 0.8 && t.failureRisk > 0.4) {
      warnings.push(`Task "${t.id}": high impact (${pct(t.resultImpact)}%) with non-trivial risk (${pct(t.failureRisk)}%) — monitor closely`);
    }
  }

  const criticalPath = computeCriticalPath(normalized);
  const totalCost = phases.reduce((s, p) => s + p.phaseEstimatedCostTokens, 0);
  const totalTime = phases.reduce((s, p) => s + p.phaseEstimatedTimeMs, 0);
  const sequentialBaseline = normalized.reduce((s, t) => s + t.estimatedTimeMs, 0);
  const savings = Math.max(0, sequentialBaseline - totalTime);

  const parallelPhases = phases.filter(p => p.mode === "parallel").length;
  const summaryParts = [
    `${phases.length} phase(s) (${parallelPhases} parallel)`,
    `${tasks.length} task(s)`,
    `est. time ${totalTime}ms vs ${sequentialBaseline}ms baseline (${savings}ms saved)`,
    `est. cost ${totalCost} tokens`,
    `critical path: ${criticalPath.join(" → ")}`,
  ];
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);

  return {
    valid: true,
    phases,
    totalPhases: phases.length,
    estimatedTotalCostTokens: totalCost,
    estimatedTotalTimeMs: totalTime,
    sequentialBaselineTimeMs: sequentialBaseline,
    parallelSavingsMs: savings,
    criticalPath,
    warnings,
    summary: summaryParts.join(" | "),
  };
}
