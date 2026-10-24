import * as Print from "expo-print";
import { WebView } from "react-native-webview";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Badge, Button, Empty, ErrorText, Muted, Row, SkeletonRows, Stat, statusTone } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { TopBar } from "@/components/topbar";
import { PaymentInfo } from "@/components/payment";
import { useAuth } from "@/lib/auth";
import { addInvoiceItem, createAdvanceFee, createPayment, deleteInvoiceItem } from "@/lib/endpoints";
import { notify } from "@/lib/dialog";
import { openHtmlInWindow } from "@/lib/download";
import { exportPdf } from "@/lib/formPdf";
import { fullName, money, shortDate } from "@/lib/format";
import { receiptHtml, type ReceiptInput } from "@/lib/receipt";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Invoice, Payment, TenantBranding } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

type Tab = "COLLECTED" | "DUE";
type AdvanceMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
const advanceMethods: AdvanceMethod[] = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

function FeesView() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const { data, loading, error, reload } = useApi<{ invoices: Invoice[]; total: number }>("/invoices?take=100");
  const { data: tenantData } = useApi<{ tenant: TenantBranding }>("/tenant");
  useRefreshOnFocus(reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ html: string; title: string } | null>(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [tab, setTab] = useState<Tab | null>("DUE");
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [amtText, setAmtText] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "UPI">("CASH");
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [billFor, setBillFor] = useState<Invoice | null>(null);
  const [billLabel, setBillLabel] = useState("Electricity bill");
  const [billAmount, setBillAmount] = useState("");
  const [billBusy, setBillBusy] = useState(false);
  const [billErr, setBillErr] = useState<string | null>(null);
  const [advanceFor, setAdvanceFor] = useState<Invoice | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advancePaidAt, setAdvancePaidAt] = useState(todayString());
  const [advancePaidThrough, setAdvancePaidThrough] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<AdvanceMethod>("CASH");
  const [advanceBusy, setAdvanceBusy] = useState(false);
  const [advanceErr, setAdvanceErr] = useState<string | null>(null);

  const list = data?.invoices ?? [];
  const collected = list.reduce((sum, i) => sum + paidOf(i), 0);
  const dueList = list.filter((i) => i.status !== "CANCELLED" && i.amount - paidOf(i) > 0);
  const outstanding = dueList.reduce((sum, i) => sum + (i.amount - paidOf(i)), 0);
  const paidList = list.filter((i) => paidOf(i) > 0);
  const shown = !isOwner ? list : tab === "DUE" ? dueList : tab === "COLLECTED" ? paidList : list;

  const editBalance = editInv ? editInv.amount - paidOf(editInv) : 0;
  const editParsed = parseInt(amtText.replace(/\D/g, ""), 10) || 0;
  const billParsed = parseInt(billAmount.replace(/\D/g, ""), 10) || 0;
  const billItems = billFor?.items ?? [];
  const smallLabel = { color: colors.muted, fontSize: 12, fontWeight: "700" as const };

  const receiptFor = (inv: Invoice, payment: Payment | null): ReceiptInput => {
    const t = tenantData?.tenant;
    const payments = inv.payments ?? [];
    const priorPayments = payments.filter((p) => p.id !== payment?.id);
    const priorCash = priorPayments.reduce((sum, p) => sum + p.amount, 0);
    const advanceApplied = inv.advanceApplied ?? 0;
    const currentPaid = payment?.amount ?? 0;
    const totalPaid = priorCash + advanceApplied + currentPaid;
    const dueAmount = Math.max(inv.amount - totalPaid, 0);
    const priorPaid = priorCash;
    const priorPaymentsByDate = priorPayments.sort(
      (a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt)
    );
    return {
      pgName: t?.name ?? "PG",
      logoUrl: t?.logoUrl,
      address: t?.address,
      city: t?.city,
      phone: t?.phone,
      email: t?.email,
      receiptFooter: t?.receiptFooter,
      upiId: t?.upiId,
      upiQrUrl: t?.upiQrUrl,
      bankName: t?.bankName,
      bankAccountName: t?.bankAccountName,
      bankAccountNumber: t?.bankAccountNumber,
      bankIfsc: t?.bankIfsc,
      studentName: inv.student
        ? fullName(inv.student.firstName, inv.student.lastName)
        : "Student",
      roomNumber: inv.student?.room?.roomNumber ?? null,
      invoiceTitle: inv.title,
      amount: inv.amount,
      items: inv.items ?? [],
      priorPaid,
      priorPaidAt: priorPaymentsByDate[0]?.paidAt ?? undefined,
      paidAmount: currentPaid,
      dueAmount,
      advanceApplied,
      advanceRemaining: inv.advanceBalance ?? 0,
      method: payment?.method ?? (advanceApplied > 0 ? "ADVANCE" : ""),
      reference: null,
      paidAt: payment?.paidAt ?? inv.createdAt,
      receiptNo: (payment?.id ?? `ADV-${inv.id}`).slice(-8).toUpperCase(),
      advanceMonths: payment ? advanceMonthsFor(list, inv, payment) : [],
    };
  };

  const confirmPayment = (
    paid: number,
    due: number,
    parentNotified: number,
    studentNotified: number
  ) => {
    const notified = parentNotified + studentNotified;
    notify(
      "Payment recorded",
      `Paid ${money(paid)} · ${due > 0 ? `Due ${money(due)}` : "No dues left"}` +
        (notified > 0 ? "\nNotification sent to parent & student." : "")
    );
  };

  const openEdit = (inv: Invoice) => {
    setModalErr(null);
    setAmtText(String(inv.amount - paidOf(inv)));
    setPayMethod("CASH");
    setEditInv(inv);
  };

  const openBill = (inv: Invoice) => {
    setBillErr(null);
    setBillLabel("Electricity bill");
    setBillAmount("");
    setBillFor(inv);
  };

  const openAdvance = (inv: Invoice) => {
    setAdvanceFor(inv);
    setAdvanceAmount("");
    setAdvancePaidAt(todayString());
    setAdvancePaidThrough("");
    setAdvanceMethod("CASH");
    setAdvanceErr(null);
  };

  const saveAdvance = async () => {
    if (!advanceFor) return;
    const amount = Number(advanceAmount.replace(/\D/g, ""));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setAdvanceErr("Enter a valid advance amount.");
      return;
    }
    if (!isDate(advancePaidAt) || !isDate(advancePaidThrough)) {
      setAdvanceErr("Enter valid paid-on and paid-through dates as YYYY-MM-DD.");
      return;
    }
    if (advancePaidThrough < advancePaidAt) {
      setAdvanceErr("Paid-through date must be on or after the payment date.");
      return;
    }
    setAdvanceBusy(true);
    setAdvanceErr(null);
    try {
      await createAdvanceFee({
        studentId: advanceFor.studentId,
        amount,
        method: advanceMethod,
        paidAt: advancePaidAt,
        paidThrough: advancePaidThrough,
        note: "Advance payment",
      });
      setAdvanceFor(null);
      reload();
      notify("Advance recorded", `${money(amount)} was applied to the oldest unpaid fee or bill first.`);
    } catch (e) {
      setAdvanceErr(e instanceof Error ? e.message : "Could not record the advance.");
    } finally {
      setAdvanceBusy(false);
    }
  };

  const saveBill = async () => {
    if (!billFor) return;
    if (!billLabel.trim()) {
      setBillErr("Enter a name for the bill.");
      return;
    }
    if (billParsed <= 0) {
      setBillErr("Enter a valid amount.");
      return;
    }
    setBillBusy(true);
    setBillErr(null);
    try {
      const res = await addInvoiceItem(billFor.id, {
        label: billLabel.trim(),
        amount: billParsed,
      });
      setBillFor(res.invoice);
      setBillLabel("Electricity bill");
      setBillAmount("");
      reload();
    } catch (e) {
      setBillErr(e instanceof Error ? e.message : "Failed to add the bill");
    } finally {
      setBillBusy(false);
    }
  };

  const removeBill = async (invoiceId: string, index: number) => {
    setBillBusy(true);
    setBillErr(null);
    try {
      const res = await deleteInvoiceItem(invoiceId, index);
      setBillFor((current) => (current && current.id === invoiceId ? res.invoice : current));
      reload();
    } catch (e) {
      setBillErr(e instanceof Error ? e.message : "Failed to remove the bill");
    } finally {
      setBillBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editInv) return;
    const balance = editInv.amount - paidOf(editInv);
    const value = parseInt(amtText.replace(/\D/g, ""), 10);
    if (!value || value <= 0) {
      setModalErr("Enter a valid amount.");
      return;
    }
    if (value > balance) {
      setModalErr(`Amount cannot exceed ${money(balance)}.`);
      return;
    }
    setModalErr(null);
    setBusy(editInv.id);
    try {
      const res = await createPayment({
        studentId: editInv.studentId,
        invoiceId: editInv.id,
        amount: value,
        method: payMethod,
      });
      const inv = editInv;
      setEditInv(null);
      reload();
      await showSlip(inv, res.payment);
      confirmPayment(res.payment.amount, res.outstanding, res.parentNotified, res.studentNotified);
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setBusy(null);
    }
  };

  const showSlip = async (inv: Invoice, payment: Payment | null) => {
    const html = receiptHtml(receiptFor(inv, payment));
    setPreview({ html, title: inv.title });
  };

  const download = async (inv: Invoice) => {
    const payment = lastPayment(inv);
    if (!payment && !(inv.advanceApplied && inv.advanceApplied > 0)) return;
    setBusy(inv.id);
    setErr(null);
    try {
      await showSlip(inv, payment ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const savePdf = async (html: string) => {
    setErr(null);
    try {
      await exportPdf(html, "fee-receipt.pdf");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save the PDF");
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
      <Row between style={{ flexWrap: "wrap" }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>Fees</Text>
      </Row>
      {!isOwner ? <PaymentInfo tenant={tenantData?.tenant} /> : null}
      <ErrorText>{error || err}</ErrorText>
      <Row style={{ gap: space(3) }}>
        <Stat
          label={isOwner ? "Collected" : "Paid"}
          value={loading ? "—" : money(collected)}
          tone="success"
          active={isOwner && tab === "COLLECTED"}
          onPress={isOwner ? () => setTab(tab === "COLLECTED" ? null : "COLLECTED") : undefined}
        />
        <Stat
          label="Due"
          value={loading ? "—" : money(outstanding)}
          tone="danger"
          active={isOwner && tab === "DUE"}
          onPress={isOwner ? () => setTab(tab === "DUE" ? null : "DUE") : undefined}
        />
      </Row>
      {loading ? <SkeletonRows count={3} /> : null}
      {!loading && shown.map((inv) => {
        const paidAmt = paidOf(inv);
        const outstandingAmt = inv.amount - paidAmt;
        const isPaid = inv.status === "PAID";
        const payment = lastPayment(inv);
        const items = inv.items ?? [];
        return (
          <View key={inv.id} style={payRow(colors.card, colors.border)}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>
                {inv.title}
              </Text>
              <Muted numberOfLines={1}>
                {inv.student ? fullName(inv.student.firstName, inv.student.lastName) : "—"}
                {inv.student?.room ? ` · Room ${inv.student.room.roomNumber}` : ""} ·{" "}
                {money(paidAmt)} / {money(inv.amount)}
              </Muted>
              {payment ? (
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>
                  Paid {money(payment.amount)} · {payment.method ?? "Payment"} ·{" "}
                  {shortDate(payment.paidAt)}
                  {outstandingAmt > 0 ? ` · ${money(outstandingAmt)} due` : ""}
                </Text>
              ) : (
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>
                  Created {shortDate(inv.createdAt)}
                </Text>
              )}
              {(inv.advanceTotal ?? 0) > 0 ? (
                <Text numberOfLines={2} style={{ fontSize: 12, color: "#14532D", fontWeight: "700" }}>
                  Advance paid {money(inv.advanceTotal ?? 0)} · Used {money(inv.advanceApplied ?? 0)} · Remaining {money(inv.advanceBalance ?? 0)}
                </Text>
              ) : null}
              {items.length ? (
                <Text numberOfLines={2} style={{ fontSize: 12, color: colors.muted }}>
                  Bills: {items.map((i) => `${i.label} ${money(i.amount)}`).join(" · ")}
                </Text>
              ) : null}
            </View>
            <Badge label={inv.status} tone={statusTone(inv.status)} />
            {paidAmt > 0 ? (
              <Button
                label={isOwner ? "Slip" : "Download slip"}
                variant="ghost"
                loading={busy === inv.id}
                onPress={() => download(inv)}
              />
            ) : null}
            {isOwner && inv.status !== "CANCELLED" ? (
              <Button
                label="Add bill"
                size="sm"
                variant="ghost"
                disabled={busy === inv.id}
                onPress={() => openBill(inv)}
              />
            ) : null}
            {isOwner && inv.status !== "CANCELLED" && inv.student ? (
              <Button
                label="Record advance"
                size="sm"
                variant="ghost"
                disabled={busy === inv.id}
                onPress={() => openAdvance(inv)}
              />
            ) : null}
            {isOwner && !isPaid && outstandingAmt > 0 ? (
              <>
                <Button
                  label="Paid"
                  size="sm"
                  loading={busy === inv.id}
                  onPress={() => openEdit(inv)}
                />
                <Button
                  label="Edit amount"
                  size="sm"
                  variant="ghost"
                  disabled={busy === inv.id}
                  onPress={() => openEdit(inv)}
                />
              </>
            ) : null}
          </View>
        );
      })}
      {!loading && shown.length === 0 ? (
        <Empty
          text={
            tab === "COLLECTED" && isOwner
              ? "No payments collected yet"
              : tab === "DUE" && isOwner
                ? "No pending dues — all clear"
                : "No invoices yet"
          }
        />
      ) : null}
      </ScrollView>
    {billFor ? (
      <Modal visible transparent animationType="slide" onRequestClose={() => setBillFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setBillFor(null)} />
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: 1,
              borderColor: colors.border,
              padding: space(4),
              gap: space(3),
            }}
          >
            <Row between>
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.text }}>Add bill</Text>
              <Pressable hitSlop={8} onPress={() => setBillFor(null)}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
              </Pressable>
            </Row>

            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{billFor.title}</Text>
              {billFor.student ? (
                <Muted>
                  {fullName(billFor.student.firstName, billFor.student.lastName)}
                  {billFor.student.room ? ` · Room ${billFor.student.room.roomNumber}` : ""}
                </Muted>
              ) : null}
              <Muted>Invoice total {money(billFor.amount)}</Muted>
            </View>

            {billItems.length ? (
              <View style={{ gap: space(2) }}>
                <Text style={smallLabel}>BILLS ON THIS INVOICE</Text>
                {billItems.map((item, index) => (
                  <View
                    key={`${item.label}-${index}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}
                  >
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.text }}>
                      {item.label}
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{money(item.amount)}</Text>
                    <Pressable
                      hitSlop={8}
                      disabled={billBusy}
                      onPress={() => removeBill(billFor.id, index)}
                    >
                      <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 13 }}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={smallLabel}>BILL NAME</Text>
              <TextInput
                value={billLabel}
                onChangeText={setBillLabel}
                placeholder="Electricity bill"
                placeholderTextColor={colors.muted}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  color: colors.text,
                  borderRadius: radius.md,
                  paddingHorizontal: space(3),
                  paddingVertical: space(3),
                  fontSize: 15,
                }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={smallLabel}>AMOUNT (₹)</Text>
              <TextInput
                value={billAmount}
                onChangeText={setBillAmount}
                keyboardType="numeric"
                placeholder="e.g. 500"
                placeholderTextColor={colors.muted}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  color: colors.text,
                  borderRadius: radius.md,
                  paddingHorizontal: space(3),
                  paddingVertical: space(3),
                  fontSize: 18,
                  fontWeight: "700",
                }}
              />
              <Muted>
                {billParsed > 0
                  ? `New invoice total ${money(billFor.amount + billParsed)} — printed as its own line on the receipt.`
                  : "It is added to this invoice and printed on the fee receipt."}
              </Muted>
            </View>

            <ErrorText>{billErr}</ErrorText>

            <Row style={{ gap: space(3) }}>
              <Button label="Cancel" variant="ghost" onPress={() => setBillFor(null)} />
              <Button
                label={billParsed > 0 ? `Add ${money(billParsed)}` : "Add bill"}
                loading={billBusy}
                onPress={saveBill}
              />
            </Row>
          </View>
        </View>
      </Modal>
    ) : null}
    {editInv ? (
      <Modal visible transparent animationType="slide" onRequestClose={() => setEditInv(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditInv(null)} />
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: 1,
              borderColor: colors.border,
              padding: space(4),
              gap: space(3),
            }}
          >
            <Row between>
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.text }}>
                Edit amount
              </Text>
              <Pressable hitSlop={8} onPress={() => setEditInv(null)}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
              </Pressable>
            </Row>

            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{editInv.title}</Text>
              {editInv.student ? (
                <Muted>
                  {fullName(editInv.student.firstName, editInv.student.lastName)}
                  {editInv.student.room ? ` · Room ${editInv.student.room.roomNumber}` : ""}
                </Muted>
              ) : null}
              <Muted>
                Fee {money(editInv.amount)} · Paid {money(paidOf(editInv))} · Due{" "}
                {money(editBalance)}
              </Muted>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                AMOUNT RECEIVED
              </Text>
              <TextInput
                value={amtText}
                onChangeText={setAmtText}
                keyboardType="numeric"
                placeholder={`Up to ${money(editBalance)}`}
                placeholderTextColor={colors.muted}
                style={{
                  borderWidth: 1,
                  borderColor: modalErr ? colors.danger : colors.border,
                  backgroundColor: colors.bg,
                  color: colors.text,
                  borderRadius: radius.md,
                  paddingHorizontal: space(3),
                  paddingVertical: space(3),
                  fontSize: 18,
                  fontWeight: "700",
                }}
              />
              <Muted>
                {editParsed > 0 && editParsed <= editBalance
                  ? `${money(editBalance - editParsed)} will remain due`
                  : `Full outstanding is ${money(editBalance)}`}
              </Muted>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                PAYMENT METHOD
              </Text>
              <Row style={{ gap: space(2) }}>
                {(["CASH", "UPI"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
                    style={{
                      paddingHorizontal: space(4),
                      paddingVertical: space(2),
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: payMethod === m ? colors.primary : colors.border,
                      backgroundColor: payMethod === m ? colors.primarySolid : colors.bg,
                    }}
                  >
                    <Text
                      style={{
                        color: payMethod === m ? "#FFFFFF" : colors.text,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {m}
                    </Text>
                  </Pressable>
                ))}
              </Row>
            </View>

            <ErrorText>{modalErr}</ErrorText>

            <Row style={{ gap: space(3) }}>
              <Button label="Cancel" variant="ghost" onPress={() => setEditInv(null)} />
              <Button
                label={editParsed > 0 ? `Save ${money(editParsed)}` : "Save"}
                loading={busy === editInv.id}
                onPress={saveEdit}
              />
            </Row>
          </View>
        </View>
      </Modal>
    ) : null}
    {advanceFor ? (
      <Modal visible transparent animationType="slide" onRequestClose={() => setAdvanceFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setAdvanceFor(null)} />
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderTopWidth: 1,
              borderColor: colors.border,
              padding: space(4),
              gap: space(3),
            }}
          >
            <Row between>
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.text }}>Record advance payment</Text>
              <Pressable hitSlop={8} onPress={() => setAdvanceFor(null)}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
              </Pressable>
            </Row>
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{advanceFor.student ? fullName(advanceFor.student.firstName, advanceFor.student.lastName) : "Student"}</Text>
              <Muted>Advance first pays the oldest unpaid fee or bill. Any leftover stays available for later invoices.</Muted>
            </View>
            <TextInput
              value={advanceAmount}
              onChangeText={setAdvanceAmount}
              keyboardType="numeric"
              placeholder="Advance amount (₹)"
              placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: advanceErr ? colors.danger : colors.border, backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 18, fontWeight: "700" }}
            />
            <View style={{ gap: space(1) }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Paid on</Text>
              <TextInput value={advancePaidAt} onChangeText={setAdvancePaidAt} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 15 }} />
            </View>
            <View style={{ gap: space(1) }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Paid through</Text>
              <TextInput value={advancePaidThrough} onChangeText={setAdvancePaidThrough} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 15 }} />
            </View>
            <View style={{ gap: space(1) }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Payment method</Text>
              <Row style={{ gap: space(2), flexWrap: "wrap" }}>
                {advanceMethods.map((method) => (
                  <Pressable
                    key={method}
                    onPress={() => setAdvanceMethod(method)}
                    style={{ borderWidth: 1, borderColor: advanceMethod === method ? colors.primary : colors.border, backgroundColor: advanceMethod === method ? colors.primarySoft : colors.bg, paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.pill }}
                  >
                    <Text style={{ color: advanceMethod === method ? colors.primary : colors.text, fontWeight: "600" }}>{method.replace("_", " ")}</Text>
                  </Pressable>
                ))}
              </Row>
            </View>
            <ErrorText>{advanceErr}</ErrorText>
            <Row style={{ gap: space(3) }}>
              <Button label="Cancel" variant="ghost" onPress={() => setAdvanceFor(null)} />
              <Button label="Save advance" loading={advanceBusy} onPress={saveAdvance} />
            </Row>
          </View>
        </View>
      </Modal>
    ) : null}
    {preview ? (
      <Modal visible animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <TopBar />
          <View style={[styles.previewBar, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>Fee receipt</Text>
              <Muted>{preview.title}</Muted>
            </View>
            <Button
              label={Platform.OS === "web" ? "Open in tab" : "Print"}
              variant="ghost"
              onPress={async () => {
                if (Platform.OS !== "web") {
                  try {
                    await Print.printAsync({ html: preview.html });
                  } catch (e) {
                    notify("Print failed", e instanceof Error ? e.message : "Failed to print");
                  }
                  return;
                }
                try {
                  await openHtmlInWindow(preview.html, "Fee receipt");
                } catch (e) {
                  notify(
                    "Could not open the receipt",
                    e instanceof Error ? e.message : "Try Save PDF instead."
                  );
                }
              }}
            />
            <Button
              label="Save PDF"
              loading={savingPdf}
              onPress={async () => {
                setSavingPdf(true);
                try {
                  await savePdf(preview.html);
                } finally {
                  setSavingPdf(false);
                }
              }}
            />
            <Pressable onPress={() => setPreview(null)} style={{ padding: space(2) }}>
              <Text style={{ color: colors.muted, fontSize: 14 }}>Close</Text>
            </Pressable>
          </View>
          {Platform.OS === "web" ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space(3), padding: space(4) }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>Receipt ready</Text>
              <Muted>
                Tap “Save PDF” to download it to your computer, or open it in a new tab to print.
              </Muted>
            </View>
          ) : (
            <WebView
              source={{ html: preview.html }}
              originWhitelist={["*"]}
              style={{ flex: 1 }}
              startInLoadingState
            />
          )}
        </View>
      </Modal>
    ) : null}
    </>
  );
}

export default function Fees() {
  return (
    <DesktopShell>
      <FeesView />
    </DesktopShell>
  );
}

function paidOf(inv: Invoice): number {
  return (inv.payments ?? []).reduce((sum, p) => sum + p.amount, 0) + (inv.advanceApplied ?? 0);
}

function lastPayment(inv: Invoice): Payment | undefined {
  const payments = inv.payments ?? [];
  return payments[payments.length - 1];
}

function ymIndex(month: number, year: number): number {
  return year * 12 + (month - 1);
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function monthLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function advanceMonthsFor(invoices: Invoice[], inv: Invoice, payment: Payment): string[] {
  const now = new Date();
  const cutoff = ymIndex(now.getMonth() + 1, now.getFullYear());
  const found = new Map<number, string>();

  const consider = (i: Invoice, extra: number) => {
    if (!i.periodMonth || !i.periodYear) return;
    const index = ymIndex(i.periodMonth, i.periodYear);
    if (index <= cutoff) return;
    const paid = (i.payments ?? []).reduce((sum, p) => sum + p.amount, 0) + extra;
    if (paid < i.amount) return;
    found.set(index, monthLabel(i.periodMonth, i.periodYear));
  };

  const currentInList = invoices.some((i) => i.id === inv.id);
  for (const i of invoices) {
    if (i.studentId !== inv.studentId) continue;
    const hasPayment = (i.payments ?? []).some((p) => p.id === payment.id);
    consider(i, i.id === inv.id && !hasPayment ? payment.amount : 0);
  }
  if (!currentInList) consider(inv, payment.amount);

  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, label]) => label);
}

const styles = {
  previewBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space(3),
    padding: space(3),
    borderBottomWidth: 1,
  },
};

const payRow = (bg: string, border: string) => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  flexWrap: "wrap" as const,
  gap: space(3),
  backgroundColor: bg,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: border,
  padding: space(3),
});
