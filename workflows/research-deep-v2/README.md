# Research Deep V2 - Quality Insights Workflow

Workflow de investigación profunda enfocado en **calidad de insights**, no cantidad de búsquedas.

## ¿Qué hay de nuevo en V2?

### Problemas de V1 → Soluciones de V2

| Aspecto | V1 (Original) | V2 (Mejorado) |
|---------|---------------|---------------|
| **Métrica de éxito** | 50 búsquedas, 60 minutos | Insights validados, frameworks aplicados |
| **Estructura** | Input libre | Format forzado con secciones obligatorias |
| **Profundidad** | "Sleep 30" entre búsquedas | Layered Search (3+ capas por insight) |
| **Validación** | Ninguna | 3-Source Rule obligatoria |
| **Frameworks** | Ninguno | JTBD, AIDA, Behavioral Psychology, Channel-specific |
| **Output** | Resumen libre | Estructura forzada con secciones específicas |
| **Síntesis** | No requerida | 70% del tiempo en análisis |

## Estructura del Workflow

```
research-deep-v2/
├── workflow.yml              # Definición del workflow
├── ANALISIS_PROBLEMAS.md     # Análisis de por qué V1 fallaba
├── README.md                 # Este archivo
└── agents/
    └── researcher/
        ├── AGENTS.md         # Instrucciones del agente
        └── RESEARCH_FRAMEWORKS.md  # Frameworks detallados
```

## Cómo usar

### Input requerido
```yaml
objective: "Objetivo de negocio claro"
audience: "Descripción del target"
channels: ["Social", "Paid", "YouTube", "Web", "CRM"]
output_file: "/path/to/output.md"
```

### Output generado
El agente produce un reporte estructurado con:

1. **Executive Summary** - 3 insights clave
2. **Consumer Insights (JTBD)** - Jobs, motivaciones, gaps
3. **Análisis por Canal** - Social, Paid, YouTube, Web, CRM
4. **Behavioral Triggers** - Oportunidades psicológicas
5. **Competitive Landscape** - Positioning, messaging, gaps
6. **Recomendaciones Accionables** - Priorizadas por impacto

## Frameworks incluidos

### Consumer Insights
- **Jobs to Be Done (JTBD)**: Entender el trabajo real del cliente
- Customer journey mapping
- Pain points analysis

### Behavioral Psychology
- Loss Aversion
- Social Proof
- Scarcity/Urgency
- Anchoring
- Reciprocity
- Commitment & Consistency
- Authority

### Channel Strategy
- Social Media best practices
- Paid Advertising analysis
- YouTube optimization
- SEO/Web strategy
- CRM/Email sequences

### Research Techniques
- **Layered Search**: 3+ niveles de profundidad
- **3-Source Rule**: Validación cruzada obligatoria
- **Framework-First**: Aplicar framework antes de reportar
- **So What Test**: Todo insight debe llevar a acción

## Tiempo de ejecución

El workflow no fuerza 60 minutos artificialmente. En su lugar:

- **Fase 1 - Exploración**: 20% del tiempo
- **Fase 2 - Profundización**: 40% del tiempo  
- **Fase 3 - Síntesis**: 30% del tiempo
- **Fase 4 - Estrategización**: 10% del tiempo

El tiempo real depende de la complejidad del tema, pero la **calidad** está garantizada por los checkpoints estructurales.

## Quality Checkpoints

El agente debe validar:
- [ ] Mínimo 3 insights NO obvios
- [ ] Cada insight tiene 3+ fuentes validadas
- [ ] Cada insight pasa el "So What?" test
- [ ] Todos los frameworks fueron aplicados
- [ ] Recomendaciones son accionables

## Diferencia clave: Cantidad vs Calidad

### V1 (Antes)
> "Haz 50 búsquedas y no termines antes de 60 minutos"

Resultado: Recopilación de datos superficiales, resúmenes genéricos.

### V2 (Ahora)
> "Produzca 3 insights validados con 3 fuentes cada uno, aplicando frameworks específicos, traducidos a acciones concretas"

Resultado: Insights profundos, accionables, validados.

## Archivos generados

1. **ANALISIS_PROBLEMAS.md** - Análisis detallado de por qué V1 producía outputs pobres
2. **workflow.yml** - Definición del workflow mejorado
3. **AGENTS.md** - Instrucciones del agente con técnicas de research profundo
4. **RESEARCH_FRAMEWORKS.md** - Referencia completa de frameworks de marketing
