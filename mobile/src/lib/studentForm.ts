export interface StudentFormInput {
  pgName?: string | null;
  logoUrl?: string | null;
  student: {
    firstName: string;
    lastName?: string | null;
    gender?: string | null;
    dob?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    guardianEmail?: string | null;
    roomNumber?: string | null;
    bedLabel?: string | null;
    joinDate?: string | null;
    status?: string | null;
  };
  admission?: {
    course?: string | null;
    college?: string | null;
    note?: string | null;
    submittedAt?: string | null;
  } | null;
  parents: {
    name: string;
    relation?: string | null;
    phone?: string | null;
    email?: string | null;
    isSuperParent?: boolean | null;
  }[];
  documents: { title: string; url: string }[];
  generatedAt: string;
}

const esc = (value?: string | null): string =>
  (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtDate = (value?: string | null): string => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export function studentFormHtml(r: StudentFormInput): string {
  const s = r.student;
  const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
  const rows: [string, string][] = [
    ["Full name", name],
    ["Gender", s.gender ?? "-"],
    ["Date of birth", fmtDate(s.dob)],
    ["Phone", s.phone ?? "-"],
    ["Email", s.email ?? "-"],
    ["Address", s.address ?? "-"],
    ["Room", s.roomNumber ? `Room ${s.roomNumber}` : "Unassigned"],
    ["Bed", s.bedLabel ?? "Unassigned"],
    ["Join date", fmtDate(s.joinDate)],
    ["Status", s.status ?? "-"],
  ];

  const guardian: [string, string][] = [
    ["Guardian name", s.guardianName ?? "-"],
    ["Guardian phone", s.guardianPhone ?? "-"],
    ["Guardian email", s.guardianEmail ?? "-"],
  ];
  if (r.admission) {
    guardian.push(["Course", r.admission.course ?? "-"]);
    guardian.push(["College", r.admission.college ?? "-"]);
    guardian.push(["Note", r.admission.note ?? "-"]);
    guardian.push(["Applied on", fmtDate(r.admission.submittedAt)]);
  }

  const rowHtml = ([label, value]: [string, string]) =>
    `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

  const parentHtml = r.parents.length
    ? r.parents
        .map((p) => {
          const kind =
            p.isSuperParent === true ? "Super parent" : p.isSuperParent === false ? "Normal" : "Auto";
          return `<div class="box">
            <div class="boxTitle">${esc(p.name)}${p.relation ? ` · ${esc(p.relation)}` : ""}</div>
            <div class="row"><span>Phone</span><b>${esc(p.phone ?? "-")}</b></div>
            <div class="row"><span>Email</span><b>${esc(p.email ?? "-")}</b></div>
            <div class="row"><span>Type</span><b>${esc(kind)}</b></div>
          </div>`;
        })
        .join("")
    : `<p class="muted">No parents linked</p>`;

  const docHtml = r.documents.length
    ? r.documents
        .map(
          (d) => `<div class="doc">
            <div class="docTitle">${esc(d.title)}</div>
            <img src="${esc(d.url)}" alt="${esc(d.title)}" />
          </div>`
        )
        .join("")
    : `<p class="muted">No documents uploaded</p>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Student form</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#0F172A; margin:0; padding:24px; background:#fff; }
  .head { display:flex; align-items:center; gap:16px; border-bottom:2px solid #0F172A; padding-bottom:14px; }
  .logo { width:64px; height:64px; border-radius:12px; object-fit:cover; }
  h1 { font-size:20px; margin:0 0 4px; }
  .muted { color:#64748B; font-size:13px; margin:0; }
  .badge { margin-left:auto; font-size:12px; letter-spacing:2px; color:#2563EB; font-weight:700; text-transform:uppercase; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.5px; color:#334155;
       margin:22px 0 8px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; }
  .row { display:flex; justify-content:space-between; gap:16px; padding:6px 0; border-bottom:1px solid #F1F5F9; font-size:14px; }
  .row span { color:#64748B; }
  .row b { color:#0F172A; text-align:right; }
  .boxes { display:flex; gap:12px; flex-wrap:wrap; }
  .box { flex:1; min-width:220px; border:1px solid #E2E8F0; border-radius:10px; padding:12px; }
  .boxTitle { font-size:14px; font-weight:700; margin-bottom:6px; }
  .docs { display:flex; gap:14px; flex-wrap:wrap; }
  .doc { width:46%; min-width:180px; border:1px solid #E2E8F0; border-radius:10px; padding:8px; }
  .docTitle { font-size:12px; color:#64748B; margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }
  .doc img { width:100%; border-radius:6px; }
  .foot { margin-top:26px; font-size:12px; color:#64748B; border-top:1px solid #E2E8F0; padding-top:12px; }
  .sign { margin-top:34px; text-align:right; font-size:12px; color:#64748B; }
</style>
</head>
<body>
  <div class="head">
    ${r.logoUrl ? `<img class="logo" src="${esc(r.logoUrl)}" alt="logo" />` : ""}
    <div>
      <h1>${esc(r.pgName ?? "Student")}</h1>
      <p class="muted">${esc(name)}${s.roomNumber ? ` · Room ${esc(s.roomNumber)}` : ""}</p>
    </div>
    <div class="badge">Admission form</div>
  </div>

  <h2>Student details</h2>
  ${rows.map(rowHtml).join("")}

  <h2>Guardian &amp; admission</h2>
  ${guardian.map(rowHtml).join("")}

  <h2>Parents / guardians</h2>
  <div class="boxes">${parentHtml}</div>

  <h2>Documents</h2>
  <div class="docs">${docHtml}</div>

  <div class="foot">Generated on ${esc(r.generatedAt)}.</div>
  <div class="sign">Authorised signatory</div>
</body>
</html>`;
}
