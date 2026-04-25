import { AgentDefinition } from "../types.js";
import { LanguageService } from "../languageService.js";

const databaseExpertAgent: AgentDefinition = {
  name: "database-expert",
  description: "Specialist in SQL, NoSQL, and database design patterns. Optimizes queries and models data.",
  keywords: ["sql", "nosql", "database", "query", "schema", "indexing", "normalization", "mongodb", "postgres", "mysql", "redis"],
  handler: async (context) => {
    const { query } = context;
    const lang = LanguageService.detectLanguage(query);

    const translations = {
      en: {
        analyzing: "Analyzing database requirements...",
        recommendation: "Recommendation",
        concepts: "Core Concepts",
        sqlHint: "For relational data, use SQL with proper normalization (3NF) and indexing on frequently searched columns.",
        nosqlHint: "For unstructured or rapidly changing data, NoSQL (like MongoDB or Redis) offers better horizontal scaling.",
        acid: "ACID compliance is key for transactional integrity in relational systems.",
        cap: "In distributed systems, remember the CAP theorem (Consistency, Availability, Partition Tolerance).",
        optimized: "Optimized for performance and scalability."
      },
      es: {
        analyzing: "Analizando requerimientos de base de datos...",
        recommendation: "Recomendación",
        concepts: "Conceptos Clave",
        sqlHint: "Para datos relacionales, usa SQL con normalización adecuada (3NF) e índices en columnas consultadas frecuentemente.",
        nosqlHint: "Para datos no estructurados o que cambian rápido, NoSQL (como MongoDB o Redis) ofrece mejor escalado horizontal.",
        acid: "El cumplimiento ACID es clave para la integridad transaccional en sistemas relacionales.",
        cap: "En sistemas distribuidos, recuerda el teorema CAP (Consistencia, Disponibilidad, Tolerancia a Particiones).",
        optimized: "Optimizado para rendimiento y escalabilidad."
      }
    };

    const t = LanguageService.translate(lang, translations);

    // Basic logic to determine if user is asking about SQL or NoSQL
    const isSQL = /sql|postgres|mysql|oracle|sqlite|relational|relacional/i.test(query);
    const isNoSQL = /nosql|mongo|redis|cassandra|dynamo|elastic/i.test(query);

    let mainAdvice = "";
    if (isSQL && !isNoSQL) {
        mainAdvice = t.sqlHint;
    } else if (isNoSQL && !isSQL) {
        mainAdvice = t.nosqlHint;
    } else {
        mainAdvice = `${t.sqlHint}\n${t.nosqlHint}`;
    }

    const message = `🗄️ **${t.analyzing}**\n\n` +
                    `💡 **${t.recommendation}**:\n${mainAdvice}\n\n` +
                    `🧠 **${t.concepts}**:\n- ${t.acid}\n- ${t.cap}\n\n` +
                    `✅ *${t.optimized}*`;

    return {
      success: true,
      message,
      data: {
        agent: "database-expert",
        detectedLanguage: lang,
        suggestions: {
            useSQL: isSQL || (!isSQL && !isNoSQL),
            useNoSQL: isNoSQL,
            patterns: ["Indexing", "Normalization", "Sharding"]
        }
      }
    };
  },
};

export default databaseExpertAgent;
