import { prisma } from "./prisma";

// One-off fix: every branch (tenant) must have at least one Property, because
// rooms require a propertyId. Branches created before multi-branch support
// shipped had none, which made "+ Add room" refuse with "No property".
async function backfillProperties() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, city: true },
  });
  let created = 0;
  for (const t of tenants) {
    const existing = await prisma.property.count({ where: { tenantId: t.id } });
    if (existing > 0) continue;
    await prisma.property.create({
      data: { tenantId: t.id, name: t.name, type: "PG", city: t.city },
    });
    created += 1;
    console.log(`Created default property for ${t.name}`);
  }
  console.log(`Done. ${created} default propert${created === 1 ? "y" : "ies"} created.`);
}

backfillProperties()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
