import { AgentDefinition } from "../types.js";
import { LanguageService } from "../languageService.js";

interface DatabaseTranslations {
  analyzing: string;
  recommendation: string;
  concepts: string;
  sqlHint: string;
  nosqlHint: string;
  acid: string;
  cap: string;
  optimized: string;
}

const databaseExpertAgent: AgentDefinition = {
  name: "database-expert",
  description: "Specialist in SQL, NoSQL, and database design patterns. Optimizes queries and models data.",
  keywords: ["sql", "nosql", "database", "query", "schema", "indexing", "normalization", "mongodb", "postgres", "mysql", "redis"],
  handler: async (context) => {
    const { query } = context;
    const lang = LanguageService.detectLanguage(query);

    const translations: Record<string, DatabaseTranslations> = {
      en: { analyzing: "Analyzing database requirements...", recommendation: "Recommendation", concepts: "Core Concepts", sqlHint: "For relational data, use SQL with proper normalization (3NF) and indexing on frequently searched columns.", nosqlHint: "For unstructured or rapidly changing data, NoSQL (like MongoDB or Redis) offers better horizontal scaling.", acid: "ACID compliance is key for transactional integrity in relational systems.", cap: "In distributed systems, remember the CAP theorem (Consistency, Availability, Partition Tolerance).", optimized: "Optimized for performance and scalability." },
      es: { analyzing: "Analizando requerimientos de base de datos...", recommendation: "Recomendación", concepts: "Conceptos Clave", sqlHint: "Para datos relacionales, usa SQL con normalización adecuada (3NF) e índices en columnas consultadas frecuentemente.", nosqlHint: "Para datos no estructurados o que cambian rápido, NoSQL (como MongoDB o Redis) ofrece mejor escalado horizontal.", acid: "El cumplimiento ACID es clave para la integridad transaccional en sistemas relacionales.", cap: "En sistemas distribuidos, recuerda el teorema CAP (Consistencia, Disponibilidad, Tolerancia a Particiones).", optimized: "Optimizado para rendimiento y escalabilidad." },
      ca: { analyzing: "Analitzant requeriments de base de dades...", recommendation: "Recomanació", concepts: "Conceptes Clau", sqlHint: "Per a dades relacionals, utilitza SQL amb normalització adequada (3NF) i índexs en columnes consultades freqüentment.", nosqlHint: "Per a dades no estructurades o que canvien ràpidament, NoSQL (com MongoDB o Redis) ofereix millor escalat horitzontal.", acid: "El compliment ACID és clau per a la integritat transaccional en sistemes relacionals.", cap: "En sistemes distribuïts, recorda el teorema CAP (Consistència, Disponibilitat, Tolerància a Particions).", optimized: "Optimitzat per a rendiment i escalabilitat." },
      fr: { analyzing: "Analyse des besoins en base de données...", recommendation: "Recommandation", concepts: "Concepts Clés", sqlHint: "Pour les données relationnelles, utilisez SQL avec une normalisation appropriée (3NF) et des index sur les colonnes fréquemment consultées.", nosqlHint: "Pour les données non structurées ou changeant rapidement, le NoSQL (comme MongoDB ou Redis) offre une meilleure mise à l'échelle horizontale.", acid: "La conformité ACID est essentielle pour l'intégrité transactionnelle dans les systèmes relationnels.", cap: "Dans les systèmes distribués, n'oubliez pas le théorème CAP (Cohérence, Disponibilité, Tolérance au partitionnement).", optimized: "Optimisé pour la performance et l'évolutivité." },
      pt: { analyzing: "Analisando requisitos de banco de dados...", recommendation: "Recomendação", concepts: "Conceitos Básicos", sqlHint: "Para dados relacionais, use SQL com normalização adequada (3NF) e indexação em colunas pesquisadas com frequência.", nosqlHint: "Para dados não estruturados ou que mudam rapidamente, o NoSQL (como MongoDB ou Redis) oferece melhor dimensionamento horizontal.", acid: "A conformidade com ACID é fundamental para a integridade transacional em sistemas relacionais.", cap: "Em sistemas distribuídos, lembre-se do teorema CAP (Consistência, Disponibilidade, Tolerância a Partições).", optimized: "Otimizado para desempenho e escalabilidade." },
      de: { analyzing: "Datenbankanforderungen werden analysiert...", recommendation: "Empfehlung", concepts: "Kernkonzepte", sqlHint: "Verwenden Sie für relationale Daten SQL mit ordnungsgemäßer Normalisierung (3NF) und Indizierung für häufig durchsuchte Spalten.", nosqlHint: "Für unstrukturierte oder sich schnell ändernde Daten bietet NoSQL (wie MongoDB oder Redis) eine bessere horizontale Skalierung.", acid: "ACID-Konformität ist der Schlüssel für die Transaktionsintegritat in relationalen Systemen.", cap: "Denken Sie bei verteilten Systemen an das CAP-Theorem (Konsistenz, Verfügbarkeit, Partitionstoleranz).", optimized: "Optimiert für Leistung und Skalierbarkeit." },
      zh: { analyzing: "正在分析数据库需求...", recommendation: "建议", concepts: "核心概念", sqlHint: "对于关系型数据，请使用 SQL 并进行适当的规范化 (3NF)，并在经常搜索的列上建立索引。", nosqlHint: "对于非结构化或快速变化的数据，NoSQL（如 MongoDB 或 Redis）提供更好的水平扩展。", acid: "ACID 合规性是关系型系统事务完整性的关键。", cap: "在分布式系统中，请记住 CAP 定理（一致性、可用性、分区容错性）。", optimized: "针对性能和可扩展性进行了优化。" },
      ja: { analyzing: "データベース要件を分析中...", recommendation: "推奨事項", concepts: "コアコンセプト", sqlHint: "リレーショナルデータの場合、適切な正規化 (3NF) と頻繁に検索される列のインデックス作成を伴う SQL を使用します。", nosqlHint: "非構造化データや急速に変化するデータの場合、NoSQL (MongoDB や Redis など) の方が水平スケーリングが優れています。", acid: "ACID コンプライアンスは、リレーショナル システムにおけるトランザクションの整合性の鍵となります。", cap: "分散システムでは、CAP 定理 (一貫性、可用性、パーティション耐性) を忘れないでください。", optimized: "パフォーマンスとスケーラビリティが最適化されました。" },
      ru: { analyzing: "Анализ требований к базе данных...", recommendation: "Рекомендация", concepts: "Основные концепции", sqlHint: "Для реляционных данных используйте SQL с надлежащей нормализацией (3NF) и индексацией часто запрашиваемых столбцов.", nosqlHint: "Для неструктурированных или быстро меняющихся данных NoSQL (например, MongoDB или Redis) обеспечивает лучшее горизонтальное масштабирование.", acid: "Соответствие ACID является ключом к целостности транзакций в реляционных системах.", cap: "В распределенных системах помните теорему CAP (согласованность, доступность, устойчивость к разделению).", optimized: "Оптимизировано для производительности и масштабируемости." }
    };

    const t = LanguageService.translate<DatabaseTranslations>(lang, translations);

    const isSQL = /sql|postgres|mysql|oracle|sqlite|relational|relacional|relacionas|relationnel/i.test(query);
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
        suggestions: { useSQL: isSQL || (!isSQL && !isNoSQL), useNoSQL: isNoSQL, patterns: ["Indexing", "Normalization", "Sharding"] }
      }
    };
  },
};

export default databaseExpertAgent;
