import fs from "fs";
import path from "path";
import { AgentDefinition, AgentContext, AgentResult } from "../types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Environment = "dev" | "staging" | "prod";

interface AppProfile {
  name: string;
  image: string;
  port: number;
  replicas: Record<Environment, number>;
  cpuRequest: string;
  cpuLimit: string;
  memRequest: string;
  memLimit: string;
  hasHealthCheck: boolean;
  env: Record<string, string>;
}

function defaultProfile(name: string, image: string, port: number): AppProfile {
  return {
    name,
    image,
    port,
    replicas: { dev: 1, staging: 2, prod: 3 },
    cpuRequest: "100m",
    cpuLimit: "500m",
    memRequest: "128Mi",
    memLimit: "512Mi",
    hasHealthCheck: true,
    env: {},
  };
}

// ─── Manifest generators ──────────────────────────────────────────────────────

function namespace(name: string, env: Environment): string {
  return `apiVersion: v1
kind: Namespace
metadata:
  name: ${name}-${env}
  labels:
    app.kubernetes.io/name: ${name}
    environment: ${env}
`;
}

function configmap(p: AppProfile, env: Environment): string {
  const data = Object.entries(p.env)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join("\n") || "  # Add non-sensitive env vars here\n  NODE_ENV: \"${env}\"";

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${p.name}-config
  namespace: ${p.name}-${env}
  labels:
    app.kubernetes.io/name: ${p.name}
    app.kubernetes.io/component: config
data:
${data}
`;
}

function secret(p: AppProfile, env: Environment): string {
  return `apiVersion: v1
kind: Secret
metadata:
  name: ${p.name}-secret
  namespace: ${p.name}-${env}
  labels:
    app.kubernetes.io/name: ${p.name}
type: Opaque
# Use 'kubectl create secret generic ${p.name}-secret --from-env-file=.env.${env}'
# or seal with Sealed Secrets / External Secrets Operator.
# Never commit plain-text secret values.
stringData: {}
`;
}

function deployment(p: AppProfile, env: Environment): string {
  const probes = p.hasHealthCheck ? `
          livenessProbe:
            httpGet:
              path: /health
              port: ${p.port}
            initialDelaySeconds: 15
            periodSeconds: 20
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: ${p.port}
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3` : "";

  const replicas = p.replicas[env];

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${p.name}
  namespace: ${p.name}-${env}
  labels:
    app.kubernetes.io/name: ${p.name}
    app.kubernetes.io/version: "latest"
    environment: ${env}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${p.name}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: ${p.name}
        app.kubernetes.io/name: ${p.name}
        environment: ${env}
    spec:
      serviceAccountName: ${p.name}
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
      containers:
        - name: ${p.name}
          image: ${p.image}:latest
          imagePullPolicy: Always
          ports:
            - containerPort: ${p.port}
              protocol: TCP
          envFrom:
            - configMapRef:
                name: ${p.name}-config
            - secretRef:
                name: ${p.name}-secret
                optional: true
          resources:
            requests:
              cpu: ${p.cpuRequest}
              memory: ${p.memRequest}
            limits:
              cpu: ${p.cpuLimit}
              memory: ${p.memLimit}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
${probes}
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: ${p.name}
`;
}

function service(p: AppProfile, env: Environment): string {
  return `apiVersion: v1
kind: Service
metadata:
  name: ${p.name}
  namespace: ${p.name}-${env}
  labels:
    app.kubernetes.io/name: ${p.name}
spec:
  selector:
    app: ${p.name}
  ports:
    - name: http
      port: 80
      targetPort: ${p.port}
      protocol: TCP
  type: ClusterIP
`;
}

function ingress(p: AppProfile, env: Environment, hostname: string): string {
  const host = env === "prod" ? hostname : `${env}.${hostname}`;

  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${p.name}
  namespace: ${p.name}-${env}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: letsencrypt-prod
  labels:
    app.kubernetes.io/name: ${p.name}
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ${host}
      secretName: ${p.name}-tls
  rules:
    - host: ${host}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${p.name}
                port:
                  number: 80
`;
}

function hpa(p: AppProfile, env: Environment): string {
  const min = p.replicas[env];
  const max = min * 4;

  return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${p.name}
  namespace: ${p.name}-${env}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${p.name}
  minReplicas: ${min}
  maxReplicas: ${max}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
`;
}

function serviceAccount(p: AppProfile, env: Environment): string {
  return `apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${p.name}
  namespace: ${p.name}-${env}
  labels:
    app.kubernetes.io/name: ${p.name}
automountServiceAccountToken: false
`;
}

function pdb(p: AppProfile, env: Environment): string {
  if (env === "dev") return "";
  return `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ${p.name}
  namespace: ${p.name}-${env}
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: ${p.name}
`;
}

function networkPolicy(p: AppProfile, env: Environment): string {
  return `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${p.name}-netpol
  namespace: ${p.name}-${env}
spec:
  podSelector:
    matchLabels:
      app: ${p.name}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: ${p.port}
  egress:
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 53
        - protocol: UDP
          port: 53
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
      ports:
        - protocol: TCP
          port: 443
`;
}

// ─── Helm chart ───────────────────────────────────────────────────────────────

function helmChart(p: AppProfile): Record<string, string> {
  const chartYaml = `apiVersion: v2
name: ${p.name}
description: Helm chart for ${p.name}
type: application
version: 0.1.0
appVersion: "1.0.0"
`;

  const valuesYaml = `replicaCount: 1

image:
  repository: ${p.image}
  tag: latest
  pullPolicy: Always

service:
  type: ClusterIP
  port: 80
  targetPort: ${p.port}

ingress:
  enabled: false
  className: nginx
  host: ${p.name}.example.com
  tls: true

resources:
  requests:
    cpu: ${p.cpuRequest}
    memory: ${p.memRequest}
  limits:
    cpu: ${p.cpuLimit}
    memory: ${p.memLimit}

autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilization: 70

env: {}
secrets: {}
`;

  const deploymentTemplate = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${p.name}.fullname" . }}
  labels:
    {{- include "${p.name}.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "${p.name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${p.name}.selectorLabels" . | nindent 8 }}
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: ${p.port}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          livenessProbe:
            httpGet:
              path: /health
              port: ${p.port}
          readinessProbe:
            httpGet:
              path: /health
              port: ${p.port}
`;

  const helpersTemplate = `{{- define "${p.name}.fullname" -}}
{{- .Release.Name }}-{{ .Chart.Name }}
{{- end }}

{{- define "${p.name}.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{ include "${p.name}.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "${p.name}.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
`;

  return {
    [`helm/${p.name}/Chart.yaml`]: chartYaml,
    [`helm/${p.name}/values.yaml`]: valuesYaml,
    [`helm/${p.name}/templates/deployment.yaml`]: deploymentTemplate,
    [`helm/${p.name}/templates/_helpers.tpl`]: helpersTemplate,
  };
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

interface Finding {
  severity: "error" | "warn" | "info";
  message: string;
}

function analyzeManifest(content: string): Finding[] {
  const findings: Finding[] = [];

  if (!content.includes("resources:"))
    findings.push({ severity: "error", message: "No resource requests/limits — pods can starve the node" });

  if (!content.includes("livenessProbe") && content.includes("kind: Deployment"))
    findings.push({ severity: "warn", message: "No livenessProbe — kubelet can't detect deadlocked containers" });

  if (!content.includes("readinessProbe") && content.includes("kind: Deployment"))
    findings.push({ severity: "warn", message: "No readinessProbe — traffic may hit pods before they're ready" });

  if (!content.includes("runAsNonRoot") && content.includes("kind: Deployment"))
    findings.push({ severity: "error", message: "Container may run as root — set securityContext.runAsNonRoot: true" });

  if (!content.includes("allowPrivilegeEscalation") && content.includes("kind: Deployment"))
    findings.push({ severity: "warn", message: "allowPrivilegeEscalation not explicitly disabled" });

  if (content.includes(":latest"))
    findings.push({ severity: "warn", message: "Image tag :latest used — not reproducible, pin to SHA or semver" });

  if (content.includes("automountServiceAccountToken") === false && content.includes("kind: Deployment"))
    findings.push({ severity: "info", message: "ServiceAccount token auto-mounted — disable if app doesn't use K8s API" });

  if (!content.includes("HorizontalPodAutoscaler") && content.includes("kind: Deployment"))
    findings.push({ severity: "info", message: "No HPA configured — deployment won't auto-scale under load" });

  if (!content.includes("PodDisruptionBudget"))
    findings.push({ severity: "warn", message: "No PodDisruptionBudget — node drains may take all replicas offline" });

  if (!content.includes("NetworkPolicy"))
    findings.push({ severity: "warn", message: "No NetworkPolicy — all pods can communicate freely" });

  return findings;
}

// ─── Agent handler ────────────────────────────────────────────────────────────

async function handler(ctx: AgentContext): Promise<AgentResult> {
  const projectRoot = (ctx.metadata?.projectRoot as string | undefined) ?? process.cwd();
  const writeFiles = (ctx.metadata?.write as boolean | undefined) ?? false;
  const q = ctx.query.toLowerCase();

  const action =
    (ctx.metadata?.action as string | undefined) ??
    (q.includes("analyz") || q.includes("audit") || q.includes("review") ? "analyze"
      : q.includes("helm") ? "helm"
      : q.includes("all") || q.includes("full") ? "all"
      : "generate");

  const env: Environment =
    (ctx.metadata?.env as Environment | undefined) ??
    (q.includes("prod") ? "prod" : q.includes("staging") ? "staging" : "dev");

  const appName =
    (ctx.metadata?.name as string | undefined) ??
    path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const image = (ctx.metadata?.image as string | undefined) ?? `your-registry/${appName}`;
  const port = Number(ctx.metadata?.port ?? 3000);
  const hostname = (ctx.metadata?.hostname as string | undefined) ?? `${appName}.example.com`;

  const profile = defaultProfile(appName, image, port);

  // ── Analyze ──
  if (action === "analyze") {
    const k8sDir = path.join(projectRoot, "k8s");
    if (!fs.existsSync(k8sDir)) {
      return { success: false, message: "No k8s/ directory found. Run with action=generate first." };
    }
    const content = fs.readdirSync(k8sDir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .map((f) => fs.readFileSync(path.join(k8sDir, f), "utf-8"))
      .join("\n---\n");

    const findings = analyzeManifest(content);
    const icons = { error: "✗", warn: "⚠", info: "ℹ" } as const;
    const report = findings.length === 0
      ? "No issues found."
      : findings.map((f) => `${icons[f.severity]} [${f.severity.toUpperCase()}] ${f.message}`).join("\n");

    return {
      success: true,
      message: `K8s manifest analysis (${k8sDir}):\n\n${report}`,
      data: { findings, errors: findings.filter((f) => f.severity === "error").length },
    };
  }

  const outputs: Record<string, string> = {};

  function write(relativePath: string, content: string): void {
    if (!content) return;
    outputs[relativePath] = content;
    if (writeFiles) {
      const full = path.join(projectRoot, relativePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf-8");
    }
  }

  if (action === "helm") {
    const files = helmChart(profile);
    for (const [fp, content] of Object.entries(files)) write(fp, content);
  } else {
    // generate or all
    const envs: Environment[] = action === "all" ? ["dev", "staging", "prod"] : [env];

    for (const e of envs) {
      const prefix = `k8s/${e}`;
      write(`${prefix}/namespace.yaml`, namespace(appName, e));
      write(`${prefix}/serviceaccount.yaml`, serviceAccount(profile, e));
      write(`${prefix}/configmap.yaml`, configmap(profile, e));
      write(`${prefix}/secret.yaml`, secret(profile, e));
      write(`${prefix}/deployment.yaml`, deployment(profile, e));
      write(`${prefix}/service.yaml`, service(profile, e));
      write(`${prefix}/ingress.yaml`, ingress(profile, e, hostname));
      write(`${prefix}/hpa.yaml`, hpa(profile, e));
      write(`${prefix}/networkpolicy.yaml`, networkPolicy(profile, e));
      const pdbContent = pdb(profile, e);
      if (pdbContent) write(`${prefix}/pdb.yaml`, pdbContent);
    }

    if (action === "all") {
      const files = helmChart(profile);
      for (const [fp, content] of Object.entries(files)) write(fp, content);
    }
  }

  const writtenFiles = Object.keys(outputs);
  const writtenMsg = writeFiles
    ? `Written ${writtenFiles.length} files to disk.`
    : `(pass metadata.write=true to write files to disk)`;

  const filesList = Object.entries(outputs)
    .map(([name, content]) => `\n${"─".repeat(44)}\n📄 ${name}\n${"─".repeat(44)}\n${content}`)
    .join("\n");

  return {
    success: true,
    message: `App: ${appName} | env: ${action === "all" ? "dev+staging+prod" : env} | image: ${image}\n${writtenMsg}${filesList}`,
    data: { files: writtenFiles, written: writeFiles ? writtenFiles : [] },
  };
}

const kubernetesAgent: AgentDefinition = {
  name: "kubernetes",
  description:
    "Kubernetes expert. Generates production-ready manifests: Deployment, Service, Ingress, ConfigMap, Secret, HPA, ServiceAccount, PodDisruptionBudget, NetworkPolicy. Generates full Helm charts. Audits existing manifests for security and reliability issues. Supports dev/staging/prod environments.",
  keywords: [
    "kubernetes", "k8s", "kubectl", "helm", "deployment", "pod", "service",
    "ingress", "container", "cluster", "namespace", "manifest", "yaml",
    "hpa", "autoscale", "configmap", "secret", "devops", "infra", "infrastructure",
  ],
  handler,
};

export default kubernetesAgent;
