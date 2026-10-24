export interface ReceiptInput {
  pgName: string;
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  receiptFooter?: string | null;
  upiId?: string | null;
  upiQrUrl?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  studentName: string;
  roomNumber?: string | null;
  invoiceTitle: string;
  amount: number;
  items?: { label: string; amount: number }[];
  priorPaid?: number;
  priorPaidAt?: string;
  paidAmount: number;
  dueAmount?: number;
  advanceApplied?: number;
  advanceRemaining?: number;
  method: string;
  reference?: string | null;
  paidAt: string;
  receiptNo: string;
  advanceMonths?: string[];
}

const esc = (value?: string | null): string =>
  (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number) => "₹" + n.toLocaleString("en-IN");

const dateOf = (value: string) => {
  const d = new Date(value);
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  );
};

const dayOf = (value: string) => {
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export function receiptHtml(r: ReceiptInput): string {
  const place = [r.address, r.city].filter(Boolean).join(", ");
  const hasBank = Boolean(r.bankName || r.bankAccountNumber);
  const due = r.dueAmount ?? 0;
  const isPartial = due > 0;
  const hasPrior = Boolean(r.priorPaid && r.priorPaid > 0);
  const settledNow = hasPrior && !isPartial;
  const items = r.items ?? [];
  const itemsTotal = items.reduce((sum, i) => sum + i.amount, 0);
  const baseAmount = Math.max(r.amount - itemsTotal, 0);

  const bankBlock = hasBank
    ? `
      <div class="box">
        <div class="boxTitle">Bank details</div>
        ${r.bankName ? `<p><span>Bank</span><b>${esc(r.bankName)}</b></p>` : ""}
        ${r.bankAccountName ? `<p><span>A/c holder</span><b>${esc(r.bankAccountName)}</b></p>` : ""}
        ${r.bankAccountNumber ? `<p><span>Account no</span><b>${esc(r.bankAccountNumber)}</b></p>` : ""}
        ${r.bankIfsc ? `<p><span>IFSC</span><b>${esc(r.bankIfsc)}</b></p>` : ""}
      </div>`
    : "";

  const upiBlock = r.upiId || r.upiQrUrl
    ? `
      <div class="box">
        <div class="boxTitle">Pay by UPI</div>
        ${r.upiId ? `<p><span>UPI ID</span><b>${esc(r.upiId)}</b></p>` : ""}
        ${r.upiQrUrl ? `<img class="qr" src="${r.upiQrUrl}" alt="UPI QR" />` : ""}
      </div>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment receipt</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#0F172A; margin:0; padding:24px; background:#fff; }
  .head { display:flex; align-items:center; gap:16px; border-bottom:2px solid #0F172A; padding-bottom:14px; }
  .logo { width:64px; height:64px; border-radius:12px; object-fit:cover; }
  h1 { font-size:20px; margin:0 0 4px; }
  .muted { color:#64748B; font-size:13px; margin:0; }
  .badge { margin-left:auto; font-size:12px; letter-spacing:2px; color:#059669; font-weight:700; }
  .badge.partial { color:#B45309; }
  .due { display:flex; justify-content:space-between; padding:11px 10px; margin-top:0;
         background:#FEF3C7; color:#92400E; font-size:15px; font-weight:700; border-radius:0 0 8px 8px; }
  .advanceBalance { display:flex; justify-content:space-between; padding:11px 10px; margin-top:8px;
         background:#DCFCE7; color:#14532D; font-size:14px; font-weight:700; border-radius:8px; }
  .meta { display:flex; justify-content:space-between; margin:16px 0; font-size:13px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:14px; }
  th, td { text-align:left; padding:9px 8px; border-bottom:1px solid #E2E8F0; }
  th { color:#64748B; font-size:12px; text-transform:uppercase; letter-spacing:.5px; }
  td.num, th.num { text-align:right; }
  .total { display:flex; justify-content:space-between; padding:14px 10px; margin-top:0;
           background:#0F172A; color:#fff; font-size:16px; font-weight:700; border-radius:0; }
  .fee { display:flex; justify-content:space-between; padding:11px 10px; font-size:14px;
         font-weight:600; color:#334155; background:#F1F5F9; border-radius:8px 8px 0 0; }
  .fee b { color:#0F172A; }
  .part { display:flex; justify-content:space-between; padding:11px 10px; font-size:14px;
          font-weight:600; color:#334155; background:#F8FAFC; border-top:1px solid #E2E8F0; }
  .part b { color:#64748B; font-weight:700; }
  .grid { display:flex; gap:16px; margin-top:18px; flex-wrap:wrap; }
  .box { flex:1; min-width:220px; border:1px solid #E2E8F0; border-radius:10px; padding:12px; }
  .boxTitle { font-size:13px; font-weight:700; margin-bottom:8px; }
  .box p { display:flex; justify-content:space-between; font-size:13px; margin:6px 0; }
  .box span { color:#64748B; }
  .qr { width:130px; height:130px; display:block; margin-top:6px; }
  .adv { margin-top:14px; border:1px solid #E2E8F0; border-radius:10px; padding:12px; }
  .advTitle { font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:#64748B; font-weight:700; margin-bottom:6px; }
  .advList { font-size:14px; font-weight:700; color:#0F172A; }
  .foot { margin-top:22px; font-size:12px; color:#64748B; border-top:1px solid #E2E8F0; padding-top:12px; }
  .sign { margin-top:34px; text-align:right; font-size:12px; color:#64748B; }
</style>
</head>
<body>
  <div class="head">
    ${r.logoUrl ? `<img class="logo" src="${r.logoUrl}" alt="logo" />` : ""}
    <div>
      <h1>${esc(r.pgName)}</h1>
      ${place ? `<p class="muted">${esc(place)}</p>` : ""}
      ${r.phone ? `<p class="muted">Phone: ${esc(r.phone)}</p>` : ""}
      ${r.email ? `<p class="muted">${esc(r.email)}</p>` : ""}
    </div>
    <div class="badge${isPartial ? " partial" : ""}">${isPartial ? "PARTIAL PAYMENT" : "PAID"}</div>
  </div>

  <div class="meta">
    <div>
      <p class="muted">Receipt no</p>
      <b>${esc(r.receiptNo)}</b>
    </div>
    <div style="text-align:right">
      <p class="muted">Date</p>
      <b>${dateOf(r.paidAt)}</b>
    </div>
  </div>

  <table>
    <tr>
      <th>Paid by</th>
      <th>Room</th>
      <th>For</th>
      <th class="num">Fee</th>
    </tr>
    <tr>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.roomNumber) || "-"}</td>
      <td>${esc(r.invoiceTitle)}</td>
      <td class="num">${money(baseAmount)}</td>
    </tr>
  </table>

  <div class="fee">
    <span>Fee amount</span>
    <b>${money(baseAmount)}</b>
  </div>
  ${items
    .map(
      (i) => `<div class="part"><span>${esc(i.label)}</span><b>${money(i.amount)}</b></div>`
    )
    .join("")}
  ${items.length ? `<div class="fee" style="border-radius:0"><span>Total charges</span><b>${money(r.amount)}</b></div>` : ""}
  ${hasPrior ? `<div class="part"><span>Partial payment${r.priorPaidAt ? ` · on ${dayOf(r.priorPaidAt)}` : ""}</span><b>${money(r.priorPaid as number)}</b></div>` : ""}
  ${r.advanceApplied ? `<div class="part"><span>Advance applied to fees and bills</span><b>${money(r.advanceApplied)}</b></div>` : ""}
  ${r.paidAmount > 0 ? `<div class="total" style="${isPartial ? "" : "border-radius:0 0 8px 8px;"}">
    <span>${hasPrior ? (settledNow ? "Due paid" : "Paid now") : "Paid"} · on ${dayOf(r.paidAt)}${r.method ? ` (${esc(r.method)})` : ""}${r.reference ? ` · Ref ${esc(r.reference)}` : ""}</span>
    <span>${money(r.paidAmount)}</span>
  </div>` : ""}
  ${isPartial ? `<div class="due"><span>Balance due</span><span>${money(due)}</span></div>` : ""}
  ${r.advanceRemaining !== undefined ? `<div class="advanceBalance"><span>Advance balance remaining</span><span>${money(r.advanceRemaining)}</span></div>` : ""}

  ${r.advanceMonths?.length ? `<div class="adv"><div class="advTitle">Advance months paid</div><div class="advList">${r.advanceMonths.map((m) => esc(m)).join(" · ")}</div></div>` : ""}

  <div class="grid">
    ${bankBlock}
    ${upiBlock}
  </div>

  ${r.receiptFooter ? `<div class="foot">${esc(r.receiptFooter)}</div>` : ""}
  <div class="sign">Authorised signatory</div>
</body>
</html>`;
}
