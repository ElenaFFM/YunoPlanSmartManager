import Link from "next/link";

const foundations = [
  {
    title: "Dominio aislado",
    description: "Rangos, cuotas y proyección temporal sin dependencias de Next.js o Prisma.",
  },
  {
    title: "Ejecución durable",
    description: "Un worker único procesa planes persistidos y nunca reintenta resultados inciertos a ciegas.",
  },
  {
    title: "Sandbox descartable",
    description: "Cada ensayo comienza desde un baseline conocido y reproducible.",
  },
];

export default function Home() {
  return (
    <main>
      <p className="eyebrow">Fase 0 · Fundaciones</p>
      <h1>Yuno Plan Manager</h1>
      <p className="lead">
        Una herramienta interna para convertir decisiones comerciales en planes de cuotas seguros,
        verificables y auditables.
      </p>
      <section aria-label="Fundaciones del producto" className="grid">
        {foundations.map((foundation) => (
          <article className="card" key={foundation.title}>
            <h2>{foundation.title}</h2>
            <p>{foundation.description}</p>
          </article>
        ))}
      </section>
      <p style={{ marginTop: "2rem" }}>
        <Link href="/catalog/bancos">Ir al catálogo →</Link>
      </p>
    </main>
  );
}

