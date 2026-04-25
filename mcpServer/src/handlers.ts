export interface AgentRecord { id: string; name: string; type: string; description: string }
export interface TaskRecord { taskId: string; agentId: string; description: string; status: string; result: string }

const agents = new Map<string, AgentRecord>()
const tasks = new Map<string, TaskRecord>()

export function listAgents(): AgentRecord[] { return [...agents.values()] }
export function listActiveTasks(): TaskRecord[] { return [...tasks.values()].filter(t => t.status === 'ACTIVE') }

export function registerAgent(agent: AgentRecord): AgentRecord {
    agents.set(agent.id, agent)
    return agent
}

export function startTask(params: Omit<TaskRecord, 'status' | 'result'>): TaskRecord {
    const task: TaskRecord = { ...params, status: 'ACTIVE', result: '' }
    tasks.set(params.taskId, task)
    return task
}

export function completeTask(taskId: string, agentId: string, result: string): TaskRecord | undefined {
    const task = tasks.get(taskId)
    if (task) { task.status = 'COMPLETED'; task.result = result }
    return task
}
