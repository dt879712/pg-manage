import { prisma } from "./prisma";
import { hashPassword } from "./auth";

const DEMO_PASSWORD = "demo123";
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysAhead = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");
const fullName = (first: string, last?: string | null) => [first, last].filter(Boolean).join(" ");

async function notify(
  tenantId: string,
  createdById: string | null,
  audience: "ALL" | "PARENTS" | "STUDENTS",
  title: string,
  body: string,
  userIds: string[]
) {
  if (!userIds.length) return;
  const created = await prisma.notification.create({
    data: { tenantId, title, body, audience, createdById },
  });
  await prisma.notificationRecipient.createMany({
    data: userIds.map((userId) => ({ notificationId: created.id, userId })),
    skipDuplicates: true,
  });
}

async function seedDemoData() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Sunrise PG & Hostel" } })) ??
    (await prisma.tenant.findFirst());
  if (!tenant) {
    console.log("No tenant found — create a tenant in the app first, then re-run npm run seed.");
    return;
  }

  const already = await prisma.student.findFirst({
    where: { tenantId: tenant.id, email: "aarav.demo@test.com" },
  });
  if (already) {
    console.log("Demo data already seeded — skipping.");
    return;
  }

  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "OWNER" },
    select: { id: true },
  });
  const tenantId = tenant.id;

  let property = await prisma.property.findFirst({ where: { tenantId } });
  if (!property) {
    property = await prisma.property.create({
      data: { tenantId, name: "Sunrise Residency", type: "PG", address: tenant.address, city: tenant.city },
    });
  }

  // --- rooms + beds -------------------------------------------------------
  const roomDefs = [
    { roomNumber: "D-101", floor: 1, gender: "MALE" as const, rent: 8000, beds: ["1", "2", "3"] },
    { roomNumber: "D-102", floor: 1, gender: "MALE" as const, rent: 8000, beds: ["1", "2", "3"] },
    { roomNumber: "G-201", floor: 2, gender: "FEMALE" as const, rent: 7500, beds: ["1", "2", "3"] },
  ];
  const roomBedIds: Record<string, Record<string, string>> = {};
  for (const def of roomDefs) {
    let room = await prisma.room.findFirst({
      where: { tenantId, propertyId: property.id, roomNumber: def.roomNumber },
    });
    if (!room) {
      room = await prisma.room.create({
        data: {
          tenantId,
          propertyId: property.id,
          roomNumber: def.roomNumber,
          floor: def.floor,
          gender: def.gender,
          capacity: def.beds.length,
          rentAmount: def.rent,
        },
      });
    }
    roomBedIds[room.id] = {};
    for (const label of def.beds) {
      let bed = await prisma.bed.findFirst({ where: { roomId: room.id, label } });
      if (!bed) {
        bed = await prisma.bed.create({ data: { tenantId, roomId: room.id, label } });
      }
      roomBedIds[room.id][label] = bed.id;
    }
  }

  // --- students + linked student & parent accounts ------------------------
  const studentDefs = [
    { first: "Aarav", last: "Mehta", gender: "MALE" as const, room: "D-101", bed: "1", parent: "Rakesh Mehta", phone: "9810011101" },
    { first: "Rohan", last: "Das", gender: "MALE" as const, room: "D-101", bed: "2", parent: "Sujata Das", phone: "9810011102" },
    { first: "Vikram", last: "Rao", gender: "MALE" as const, room: "D-101", bed: "3", parent: "Anil Rao", phone: "9810011103" },
    { first: "Karan", last: "Joshi", gender: "MALE" as const, room: "D-102", bed: "1", parent: "Mahesh Joshi", phone: "9810011104" },
    { first: "Priya", last: "Nair", gender: "FEMALE" as const, room: "G-201", bed: "1", parent: "Suresh Nair", phone: "9810011105" },
    { first: "Sneha", last: "Iyer", gender: "FEMALE" as const, room: "G-201", bed: "2", parent: "Ramesh Iyer", phone: "9810011106" },
  ];

  type DemoStudent = { id: string; first: string; last: string; email: string; user: string; parents: string[] };
  const demoStudents: DemoStudent[] = [];

  for (const def of studentDefs) {
    const sEmail = `${def.first.toLowerCase()}.demo@test.com`;
    const pEmail = `parent.${def.first.toLowerCase()}@test.com`;
    const studentUser = await prisma.user.upsert({
      where: { email: sEmail },
      update: {},
      create: {
        tenantId,
        name: fullName(def.first, def.last),
        email: sEmail,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        role: "STUDENT",
      },
    });
    const parentUser = await prisma.user.upsert({
      where: { email: pEmail },
      update: {},
      create: {
        tenantId,
        name: def.parent,
        email: pEmail,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        role: "PARENT",
      },
    });

    const room = await prisma.room.findFirst({
      where: { tenantId, roomNumber: def.room },
      select: { id: true },
    });
    const bedId = room ? roomBedIds[room.id]?.[def.bed] : undefined;
    if (!room || !bedId) continue;

    let student = await prisma.student.findFirst({ where: { tenantId, email: sEmail } });
    if (!student) {
      student = await prisma.student.create({
        data: {
          tenantId,
          propertyId: property.id,
          roomId: room.id,
          bedId,
          userId: studentUser.id,
          firstName: def.first,
          lastName: def.last,
          gender: def.gender,
          phone: def.phone,
          email: sEmail,
          guardianName: def.parent,
          guardianPhone: def.phone,
          joinDate: daysAgo(60),
          status: "ACTIVE",
        },
      });
    }
    await prisma.bed.update({ where: { id: bedId }, data: { status: "OCCUPIED" } });
    await prisma.parentStudent.upsert({
      where: { parentUserId_studentId: { parentUserId: parentUser.id, studentId: student.id } },
      update: {},
      create: { tenantId, parentUserId: parentUser.id, studentId: student.id, relation: "Guardian" },
    });

    demoStudents.push({
      id: student.id,
      first: def.first,
      last: def.last,
      email: sEmail,
      user: studentUser.id,
      parents: [parentUser.id],
    });
  }
  console.log(`Seeded ${demoStudents.length} students with parent + student logins.`);

  // --- invoices + payments (Collected / Partial / Due / Overdue) ----------
  const invoiceDefs = [
    { email: "aarav.demo@test.com", title: "October Rent", amount: 8000, paid: 8000, method: "CASH" as const, paidAgo: 7, dueIn: 0 },
    { email: "priya.demo@test.com", title: "October Rent", amount: 7500, paid: 7500, method: "UPI" as const, paidAgo: 5, dueIn: 0 },
    { email: "karan.demo@test.com", title: "September Rent", amount: 8000, paid: 8000, method: "UPI" as const, paidAgo: 20, dueIn: -10 },
    { email: "rohan.demo@test.com", title: "October Rent", amount: 8000, paid: 5000, method: "CASH" as const, paidAgo: 4, dueIn: 3 },
    { email: "sneha.demo@test.com", title: "October Rent", amount: 7500, paid: 3000, method: "UPI" as const, paidAgo: 6, dueIn: 3 },
    { email: "vikram.demo@test.com", title: "October Rent", amount: 8000, paid: 0, method: null, paidAgo: 0, dueIn: 5 },
    { email: "karan.demo@test.com", title: "October Rent", amount: 8500, paid: 0, method: null, paidAgo: 0, dueIn: -5 },
  ];

  let invoicesCreated = 0;
  let paymentsCreated = 0;
  const now = new Date();

  for (const def of invoiceDefs) {
    const stu = demoStudents.find((s) => s.email === def.email);
    if (!stu) continue;

    const dup = await prisma.invoice.findFirst({
      where: { tenantId, studentId: stu.id, title: def.title },
      select: { id: true },
    });
    if (dup) continue;

    const status =
      def.paid >= def.amount
        ? ("PAID" as const)
        : def.dueIn < 0
          ? ("OVERDUE" as const)
          : def.paid > 0
            ? ("PARTIAL" as const)
            : ("PENDING" as const);

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        studentId: stu.id,
        title: def.title,
        amount: def.amount,
        periodMonth: now.getMonth() + 1,
        periodYear: now.getFullYear(),
        dueDate: daysAhead(def.dueIn),
        status: def.paid > 0 && def.paid < def.amount ? "PARTIAL" : status,
      },
    });
    invoicesCreated++;

    if (def.paid > 0 && def.method) {
      await prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          studentId: stu.id,
          amount: def.paid,
          method: def.method,
          paidAt: daysAgo(def.paidAgo),
          recordedById: owner?.id ?? null,
        },
      });
      paymentsCreated++;

      const remaining = Math.max(invoice.amount - def.paid, 0);
      const body =
        `Payment of ${inr(def.paid)} received for ${fullName(stu.first, stu.last)}` +
        ` — ${def.title} via ${def.method}.` +
        (remaining > 0 ? ` ${inr(remaining)} still due.` : " Thank you!");
      await notify(tenantId, owner?.id ?? null, "PARENTS", "Payment received", body, stu.parents);
      await notify(tenantId, owner?.id ?? null, "STUDENTS", "Payment received", body, [stu.user]);
    }
  }
  console.log(`Seeded ${invoicesCreated} invoices and ${paymentsCreated} payments.`);

  // --- announcements ------------------------------------------------------
  const allUsers = await prisma.user.findMany({
    where: { tenantId, isActive: true },
    select: { id: true },
  });
  const userIds = allUsers.map((u) => u.id);
  const announcements = [
    {
      title: "Diwali celebration this Friday",
      body: "Join us this Friday at 7 PM in the common hall for Diwali celebrations. Light refreshments will be served.",
    },
    {
      title: "Water maintenance on Sunday",
      body: "Water supply will be paused on Sunday from 10 AM to 1 PM for tank cleaning. Please store water in advance.",
    },
  ];
  for (const a of announcements) {
    const dup = await prisma.notification.findFirst({
      where: { tenantId, title: a.title },
      select: { id: true },
    });
    if (dup) continue;
    await notify(tenantId, owner?.id ?? null, "ALL", a.title, a.body, userIds);
  }
  console.log("Seeded announcements.");

  // --- attendance history -------------------------------------------------
  for (const stu of demoStudents) {
    const today = new Date();
    const inToday = new Date(today);
    inToday.setHours(9, 5 + Math.floor(Math.random() * 20), 0, 0);
    const inYest = new Date(today);
    inYest.setDate(inYest.getDate() - 1);
    inYest.setHours(9, 2, 0, 0);
    const outYest = new Date(inYest);
    outYest.setHours(19, 35, 0, 0);

    await prisma.attendance.createMany({
      data: [
        { tenantId, studentId: stu.id, type: "CHECK_IN", method: "BUTTON", at: inToday },
        { tenantId, studentId: stu.id, type: "CHECK_IN", method: "BUTTON", at: inYest },
        { tenantId, studentId: stu.id, type: "CHECK_OUT", method: "BUTTON", at: outYest },
      ],
    });
  }
  console.log("Seeded attendance history.");

  console.log("\nDemo data ready. Sign in with:");
  console.log("  Owner    owner1@test.com / secret123");
  console.log("  Staff    staff1@test.com / staff123");
  console.log("  Students aarav.demo@test.com, rohan.demo@test.com, vikram.demo@test.com,");
  console.log("           karan.demo@test.com, priya.demo@test.com, sneha.demo@test.com");
  console.log(`           (password ${DEMO_PASSWORD})`);
  console.log("  Parents  parent.aarav@test.com, parent.rohan@test.com, ...");
  console.log(`           (password ${DEMO_PASSWORD})`);
}

async function main() {
  await seedDemoData();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
