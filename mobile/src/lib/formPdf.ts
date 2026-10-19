import { Platform } from "react-native";
import * as Print from "expo-print";
import { saveBase64File } from "./download";

export interface PdfDocItem {
  title: string;
  url: string;
}

export interface PdfDocGroup {
  heading: string;
  items: PdfDocItem[];
}

export interface StudentFormInput {
  pgName?: string | null;
  logoUrl?: string | null;
  student: {
    firstName: string;
    lastName?: string | null;
    photoUrl?: string | null;
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
    photoUrl?: string | null;
    isSuperParent?: boolean | null;
  }[];
  documents: PdfDocGroup[];
  generatedAt: string;
}

export interface ProfileFormInput {
  pgName?: string | null;
  logoUrl?: string | null;
  roleLabel: string;
  user: {
    name: string;
    email?: string | null;
    phone?: string | null;
    photoUrl?: string | null;
    isActive: boolean;
    rule?: string | null;
  };
  documents: PdfDocGroup[];
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

const CSS = `
  * { box-sizing: border-box; }
  body { margin:0; background:#fff; }
  .pdf-body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#0F172A; padding:24px; background:#fff; }
  .head { display:flex; align-items:center; gap:16px; border-bottom:2px solid #0F172A; padding-bottom:14px; }
  .logo { width:64px; height:64px; border-radius:12px; object-fit:cover; }
  .photo { width:72px; height:88px; border-radius:10px; object-fit:cover; border:1px solid #E2E8F0; margin-left:auto; }
  h1 { font-size:20px; margin:0 0 4px; }
  .muted { color:#64748B; font-size:13px; margin:0; }
  .badge { font-size:12px; letter-spacing:2px; color:#2563EB; font-weight:700; text-transform:uppercase; margin-top:4px; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.5px; color:#334155;
       margin:22px 0 8px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; }
  h3 { font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:#64748B; margin:16px 0 6px; }
  .row { display:flex; justify-content:space-between; gap:16px; padding:6px 0; border-bottom:1px solid #F1F5F9; font-size:14px; }
  .row span { color:#64748B; }
  .row b { color:#0F172A; text-align:right; }
  .boxes { display:flex; gap:12px; flex-wrap:wrap; }
  .box { flex:1; min-width:220px; border:1px solid #E2E8F0; border-radius:10px; padding:12px; display:flex; gap:12px; }
  .box img { width:52px; height:64px; border-radius:8px; object-fit:cover; border:1px solid #E2E8F0; }
  .boxTitle { font-size:14px; font-weight:700; margin-bottom:6px; }
  .docs { display:flex; gap:14px; flex-wrap:wrap; }
  .doc { width:46%; min-width:180px; border:1px solid #E2E8F0; border-radius:10px; padding:8px; }
  .docTitle { font-size:12px; color:#64748B; margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }
  .doc img { width:100%; border-radius:6px; }
  .foot { margin-top:26px; font-size:12px; color:#64748B; border-top:1px solid #E2E8F0; padding-top:12px; }
  .sign { margin-top:34px; text-align:right; font-size:12px; color:#64748B; }
`;

const rowHtml = ([label, value]: [string, string]): string =>
  `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

function docsHtml(groups: PdfDocGroup[]): string {
  const filled = groups.filter((g) => g.items.length > 0);
  if (filled.length === 0) return `<p class="muted">No documents uploaded</p>`;
  return filled
    .map(
      (g) =>
        `<h3>${esc(g.heading)}</h3><div class="docs">${g.items
          .map(
            (d) =>
              `<div class="doc"><div class="docTitle">${esc(d.title)}</div>` +
              `<img src="${esc(d.url)}" alt="${esc(d.title)}" /></div>`
          )
          .join("")}</div>`
    )
    .join("");
}

function document(title: string, headHtml: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="pdf-body">
${headHtml}
${bodyHtml}
</div>
</body>
</html>`;
}

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

  const parentHtml = r.parents.length
    ? r.parents
        .map((p) => {
          const kind =
            p.isSuperParent === true ? "Super parent" : p.isSuperParent === false ? "Normal" : "Auto";
          return `<div class="box">
            ${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="${esc(p.name)}" />` : ""}
            <div>
              <div class="boxTitle">${esc(p.name)}${p.relation ? ` · ${esc(p.relation)}` : ""}</div>
              <div class="row"><span>Phone</span><b>${esc(p.phone ?? "-")}</b></div>
              <div class="row"><span>Email</span><b>${esc(p.email ?? "-")}</b></div>
              <div class="row"><span>Type</span><b>${esc(kind)}</b></div>
            </div>
          </div>`;
        })
        .join("")
    : `<p class="muted">No parents linked</p>`;

  const head = `<div class="head">
    ${r.logoUrl ? `<img class="logo" src="${esc(r.logoUrl)}" alt="logo" />` : ""}
    <div style="flex:1">
      <h1>${esc(r.pgName ?? "Student")}</h1>
      <p class="muted">${esc(name)}${s.roomNumber ? ` · Room ${esc(s.roomNumber)}` : ""}</p>
      <div class="badge">Admission form</div>
    </div>
    ${s.photoUrl ? `<img class="photo" src="${esc(s.photoUrl)}" alt="${esc(name)}" />` : ""}
  </div>`;

  const body = `
  <h2>Student details</h2>
  ${rows.map(rowHtml).join("")}
  <h2>Guardian &amp; admission</h2>
  ${guardian.map(rowHtml).join("")}
  <h2>Parents / guardians</h2>
  <div class="boxes">${parentHtml}</div>
  <h2>Documents</h2>
  ${docsHtml(r.documents)}
  <div class="foot">Generated on ${esc(r.generatedAt)}.</div>
  <div class="sign">Authorised signatory</div>`;

  return document("Student form", head, body);
}

export function profileFormHtml(r: ProfileFormInput): string {
  const u = r.user;
  const rows: [string, string][] = [
    ["Name", u.name],
    ["Role", r.roleLabel],
    ["Phone", u.phone ?? "-"],
    ["Email", u.email ?? "-"],
    ["Status", u.isActive ? "Active" : "Disabled"],
  ];
  if (u.rule) rows.push(["Super parent", u.rule]);

  const head = `<div class="head">
    ${r.logoUrl ? `<img class="logo" src="${esc(r.logoUrl)}" alt="logo" />` : ""}
    <div style="flex:1">
      <h1>${esc(r.pgName ?? "Profile")}</h1>
      <p class="muted">${esc(u.name)} · ${esc(r.roleLabel)}</p>
      <div class="badge">Profile</div>
    </div>
    ${u.photoUrl ? `<img class="photo" src="${esc(u.photoUrl)}" alt="${esc(u.name)}" />` : ""}
  </div>`;

  const body = `
  <h2>Details</h2>
  ${rows.map(rowHtml).join("")}
  <h2>Documents</h2>
  ${docsHtml(r.documents)}
  <div class="foot">Generated on ${esc(r.generatedAt)}.</div>`;

  return document("Profile", head, body);
}

async function exportPdfOnWeb(html: string, filename: string): Promise<void> {
  const mod = await import("html2pdf.js");
  const html2pdf = mod.default ?? mod;
  await html2pdf()
    .set({
      margin: 0,
      filename,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    })
    .from(html)
    .save();
}

export async function exportPdf(html: string, filename: string): Promise<void> {
  if (Platform.OS === "web") {
    await exportPdfOnWeb(html, filename);
    return;
  }

  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error("Could not create the PDF");
  await saveBase64File(base64, filename, "application/pdf");
}
