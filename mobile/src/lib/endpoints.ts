import { api } from "./api";
import type {
  AdvanceFee,
  Admission,
  AdmissionStatusResult,
  AppNotification,
  Bed,
  DocumentFile,
  Invoice,
  Leave,
  LeaveTarget,
  ManagedUser,
  Message,
  MessageListResult,
  Payment,
  Pg,
  Property,
  PublicPg,
  Room,
  StatusVideo,
  Student,
  SuperParentSummary,
  TenantBranding,
  TenantImage,
  UserDetail,
} from "./types";

type DirectUploadPurpose =
  | "student-photo"
  | "user-photo"
  | "document"
  | "tenant-branding"
  | "tenant-gallery"
  | "status-video"
  | "admission-document";

type DirectUploadOptions = {
  purpose: DirectUploadPurpose;
  dataUrl: string;
  studentId?: string;
  userId?: string;
  publicAdmission?: boolean;
};

async function uploadMediaDirect(input: DirectUploadOptions): Promise<{ fileUrl: string; mimeType: string; sizeBytes: number }> {
  const publicAdmission = input.publicAdmission === true;
  const signaturePath = publicAdmission ? "/media/admission/sign" : "/media/sign";
  const confirmPath = publicAdmission ? "/media/admission/confirm" : "/media/confirm";
  const target = {
    purpose: input.purpose,
    ...(input.studentId ? { studentId: input.studentId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
  };
  const signature = await api<{
    cloudName: string;
    apiKey: string;
    resourceType: "image" | "video";
    folder: string;
    publicId: string;
    timestamp: number;
    type: string;
    signature: string;
  }>(signaturePath, {
    method: "POST",
    body: target,
    auth: !publicAdmission,
  });

  const form = new FormData();
  form.append("file", input.dataUrl);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("signature", signature.signature);
  form.append("type", signature.type);
  form.append("folder", signature.folder);
  form.append("public_id", signature.publicId);

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/${signature.resourceType}/upload`,
    { method: "POST", body: form }
  );
  const uploadResult = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || typeof uploadResult?.public_id !== "string") {
    throw new Error(uploadResult?.error?.message ?? "Could not upload this file to Cloudinary.");
  }

  const confirmed = await api<{ fileUrl: string; mimeType: string; sizeBytes: number }>(confirmPath, {
    method: "POST",
    body: { ...target, publicId: uploadResult.public_id },
    auth: !publicAdmission,
  });
  return confirmed;
}

async function mediaReference(
  value: unknown,
  purpose: DirectUploadPurpose,
  extra: Pick<DirectUploadOptions, "studentId" | "userId" | "publicAdmission"> = {}
): Promise<unknown> {
  if (typeof value !== "string" || !value.startsWith("data:")) return value;
  return (await uploadMediaDirect({ ...extra, purpose, dataUrl: value })).fileUrl;
}

export function getProperties() {
  return api<{ properties: Property[] }>("/properties");
}

export function createRoom(input: {
  propertyId: string;
  roomNumber: string;
  floor?: number;
  gender?: string;
  rentAmount?: number;
  capacity?: number;
  beds?: string[];
}) {
  return api<{ room: Room }>("/rooms", { method: "POST", body: input });
}

export function addBed(roomId: string, label: string) {
  return api<{ bed: Bed }>(`/rooms/${roomId}/beds`, { method: "POST", body: { label } });
}

export function updateBed(id: string, input: { label?: string; status?: "VACANT" | "MAINTENANCE" }) {
  return api<{ bed: Bed }>(`/beds/${id}`, { method: "PATCH", body: input });
}

export function deleteBed(id: string) {
  return api<{ ok: boolean }>(`/beds/${id}`, { method: "DELETE" });
}

export function updateRoom(
  id: string,
  input: {
    roomNumber?: string;
    floor?: number | null;
    gender?: string | null;
    status?: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
    rentAmount?: number | null;
    capacity?: number;
  }
) {
  return api<{ room: Room }>(`/rooms/${id}`, { method: "PATCH", body: input });
}

export function deleteRoom(id: string) {
  return api<{ ok: boolean }>(`/rooms/${id}`, { method: "DELETE" });
}

export function attendanceApi(dir: "check-in" | "check-out", studentId?: string) {
  return api(`/attendance/${dir}`, {
    method: "POST",
    body: studentId ? { studentId } : {},
  });
}

export function resetUserPassword(userId: string, password?: string) {
  return api<{ ok: boolean; temporaryPassword?: string }>(`/users/${userId}/reset-password`, {
    method: "POST",
    body: password ? { newPassword: password } : {},
  });
}

export function forgotPassword(email: string) {
  return api<{ ok: boolean; needsEmail: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

export function resetPassword(token: string, password: string) {
  return api<{ ok: boolean }>("/auth/reset-password", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

export function createStaff(input: { name: string; email: string; password: string; role?: "STAFF" | "GUARD" }) {
  return api<{ user: ManagedUser }>("/users/staff", { method: "POST", body: input });
}

export function createStudentLogin(input: { studentId: string; email?: string; phone?: string; password?: string }) {
  return api<{ user: ManagedUser; temporaryPassword?: string }>("/users/students", {
    method: "POST",
    body: input,
  });
}

export function getUser(id: string) {
  return api<{ user: UserDetail }>(`/users/${id}`);
}

export function updateUser(id: string, body: Record<string, unknown>) {
  return (async () => {
    const next = { ...body };
    if ("photoUrl" in next) next.photoUrl = await mediaReference(next.photoUrl, "user-photo");
    return api<{ user: UserDetail }>(`/users/${id}`, { method: "PATCH", body: next });
  })();
}

export function deleteUser(id: string) {
  return api<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" });
}

export interface CreateStudentInput {
  firstName: string;
  lastName?: string;
  phone?: string;
  dob?: string;
  address?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  monthlyFee?: number;
  paidForCurrentMonth?: boolean;
  paidAmount?: number;
  advanceFeeAmount?: number;
  advanceFeePaidThrough?: string;
  photoUrl?: string;
  roomId?: string;
  bedId?: string;
  joinDate?: string;
  studentEmail?: string;
  studentPhone?: string;
  studentPassword?: string;
  parentEmail?: string;
  parentPhone?: string;
  parentPassword?: string;
}

export function createStudent(input: CreateStudentInput) {
  return (async () => {
    const body = { ...input, photoUrl: await mediaReference(input.photoUrl, "student-photo") as string | undefined };
    return api<{ student: Student }>("/students", { method: "POST", body });
  })();
}

export function updateStudent(id: string, body: Record<string, unknown>) {
  return (async () => {
    const next = { ...body };
    if ("photoUrl" in next) next.photoUrl = await mediaReference(next.photoUrl, "student-photo");
    return api<{ student: Student }>(`/students/${id}`, { method: "PATCH", body: next });
  })();
}

export function uploadDocument(input: {
  studentId?: string;
  userId?: string;
  type?: string;
  title?: string;
  side?: "front" | "back";
  dataUrl: string;
  mimeType?: string;
}) {
  return (async () => {
    const uploaded = await uploadMediaDirect({
      purpose: "document",
      dataUrl: input.dataUrl,
      studentId: input.studentId,
      userId: input.userId,
    });
    const { dataUrl: _dataUrl, ...metadata } = input;
    return api<{ document: DocumentFile }>("/documents", {
      method: "POST",
      body: { ...metadata, fileUrl: uploaded.fileUrl },
    });
  })();
}

export function deleteDocument(id: string) {
  return api<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" });
}

export function getMyDocuments() {
  return api<{ people: { studentId: string; name: string; documents: DocumentFile[] }[] }>(
    "/documents/mine"
  );
}

export function getTenant() {
  return api<{ tenant: TenantBranding }>("/tenant");
}

export function updateTenant(body: Record<string, unknown>) {
  return (async () => {
    const next = { ...body };
    if ("logoUrl" in next) next.logoUrl = await mediaReference(next.logoUrl, "tenant-branding");
    if ("upiQrUrl" in next) next.upiQrUrl = await mediaReference(next.upiQrUrl, "tenant-branding");
    return api<{ tenant: TenantBranding }>("/tenant", { method: "PATCH", body: next });
  })();
}

export function addTenantImage(input: { dataUrl: string; caption?: string }) {
  return (async () => {
    const uploaded = await uploadMediaDirect({ purpose: "tenant-gallery", dataUrl: input.dataUrl });
    return api<{ image: TenantImage }>("/tenant/images", {
      method: "POST",
      body: { fileUrl: uploaded.fileUrl, caption: input.caption },
    });
  })();
}

export function deleteTenantImage(id: string) {
  return api<{ ok: boolean }>(`/tenant/images/${id}`, { method: "DELETE" });
}

export function broadcastNotification(input: { title: string; body: string; audiences: string[] }) {
  return api<{ notification: { id: string }; recipients: number }>("/notifications/broadcast", {
    method: "POST",
    body: input,
  });
}

export function listMyPgs() {
  return api<{ pgs: Pg[] }>("/tenant/pgs");
}

export function createPg(input: { name: string; city?: string; address?: string; phone?: string }) {
  return api<{ pg: Pg }>("/tenant/pgs", { method: "POST", body: input });
}

export function switchPg(id: string) {
  return api<{ token: string; pg: { id: string; name: string } }>(`/tenant/pgs/${id}/switch`, {
    method: "POST",
    body: {},
  });
}

export function transferStudent(
  id: string,
  body: { tenantId: string; roomId?: string; bedId?: string }
) {
  return api<{ ok: boolean; studentId: string; pg: { id: string; name: string } }>(
    `/students/${id}/transfer`,
    { method: "POST", body }
  );
}

export function exitStudent(id: string) {
  return api<{ ok: boolean; exited: boolean }>(`/students/${id}/exit`, { method: "POST", body: {} });
}

export function getPublicPg() {
  return api<{ pg: PublicPg }>("/admissions/pg", { auth: false });
}

export interface AdmissionDocumentInput {
  type: string;
  title?: string;
  side?: "front" | "back";
  dataUrl: string;
  mimeType?: string;
}

export interface ApplyAdmissionInput {
  firstName: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  phone: string;
  email: string;
  address?: string;
  course?: string;
  college?: string;
  note?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianPassword?: string;
  password: string;
  documents: AdmissionDocumentInput[];
}

export function submitAdmission(input: ApplyAdmissionInput) {
  return (async () => {
    const documents = await Promise.all(input.documents.map(async (document) => {
      const uploaded = await uploadMediaDirect({
        purpose: "admission-document",
        dataUrl: document.dataUrl,
        publicAdmission: true,
      });
      const { dataUrl: _dataUrl, ...metadata } = document;
      return { ...metadata, fileUrl: uploaded.fileUrl };
    }));
    return api<{ admission: { id: string; status: string } }>("/admissions", {
      method: "POST",
      body: { ...input, documents },
      auth: false,
    });
  })();
}

export function getAdmissionStatus(email: string, phone: string) {
  return api<AdmissionStatusResult>("/admissions/status", {
    method: "POST",
    body: { email, phone },
    auth: false,
  });
}

export function getAdmissions(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<{ admissions: Admission[] }>(`/admissions${q}`);
}

export function getAdmission(id: string) {
  return api<{ admission: Admission }>(`/admissions/${id}`);
}

export function approveAdmission(
  id: string,
  body: {
    tenantId?: string;
    roomId?: string;
    bedId?: string;
    monthlyFee?: number;
    paidForCurrentMonth?: boolean;
    paidAmount?: number;
    advanceFeeAmount?: number;
    advanceFeePaidThrough?: string;
  }
) {
  return api<{ ok: boolean; studentId: string }>(`/admissions/${id}/approve`, {
    method: "POST",
    body,
  });
}

export function rejectAdmission(id: string, reason?: string) {
  return api<{ ok: boolean }>(`/admissions/${id}/reject`, { method: "POST", body: { reason } });
}

export function getNotifications() {
  return api<{ notifications: AppNotification[] }>("/notifications");
}

export function markNotificationRead(id: string) {
  return api<{ ok: boolean }>(`/notifications/${id}/read`, { method: "POST", body: {} });
}

export function getLeaveTargets() {
  return api<{ targets: LeaveTarget[] }>("/leaves/targets");
}

export interface CreateLeaveInput {
  type: string;
  fromDate: string;
  toDate: string;
  reason?: string;
  studentId?: string;
}

export function createLeave(input: CreateLeaveInput) {
  return api<{ leave: Leave }>("/leaves", { method: "POST", body: input });
}

export function getLeaves(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<{ leaves: Leave[]; total: number }>(`/leaves${q}`);
}

export function getLeave(id: string) {
  return api<{ leave: Leave }>(`/leaves/${id}`);
}

export function approveLeave(id: string) {
  return api<{ leave: Leave }>(`/leaves/${id}/approve`, { method: "POST", body: {} });
}

export function rejectLeave(id: string, reason?: string) {
  return api<{ leave: Leave }>(`/leaves/${id}/reject`, { method: "POST", body: { reason } });
}

export function cancelLeave(id: string) {
  return api<{ leave: Leave }>(`/leaves/${id}/cancel`, { method: "POST", body: {} });
}

export function sendMessage(input: { subject?: string; body: string }) {
  return api<{ message: Message }>("/messages", { method: "POST", body: input });
}

export function getMessages() {
  return api<MessageListResult>("/messages");
}

export function getMessage(id: string) {
  return api<{ message: Message }>(`/messages/${id}`);
}

export function markMessageRead(id: string) {
  return api<{ message: Message }>(`/messages/${id}/read`, { method: "POST", body: {} });
}

export function replyMessage(id: string, body: string) {
  return api<{ message: Message }>(`/messages/${id}/reply`, { method: "POST", body: { body } });
}

export type StatusDirection = "CHECK_IN" | "CHECK_OUT";

export async function uploadStatusVideo(input: {
  uri: string;
  studentId?: string;
  direction: StatusDirection;
  mimeType?: string;
}): Promise<{ video: StatusVideo }> {
  const mimeType = input.mimeType ?? "video/mp4";
  const res = await fetch(input.uri);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
  const uploaded = await uploadMediaDirect({
    purpose: "status-video",
    dataUrl,
    studentId: input.studentId,
  });
  return api<{ video: StatusVideo }>("/status-videos", {
    method: "POST",
    body: {
      fileUrl: uploaded.fileUrl,
      sizeBytes: uploaded.sizeBytes,
      studentId: input.studentId,
      direction: input.direction,
      mimeType,
    },
  });
}

export function getStatusVideos() {
  return api<{ videos: StatusVideo[] }>("/status-videos");
}

export function getStudentStatusVideo(studentId: string) {
  return api<{ video: StatusVideo }>(`/status-videos/${studentId}`);
}

export function createPayment(input: {
  studentId: string;
  invoiceId?: string;
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
}) {
  return api<{
    payment: Payment;
    invoiceStatus: string | null;
    parentNotified: number;
    studentNotified: number;
    outstanding: number;
  }>("/payments", { method: "POST", body: input });
}

export function getAdvanceFees() {
  return api<{ advanceFees: AdvanceFee[]; superParents: SuperParentSummary[]; total: number }>(
    "/advance-fees?take=100"
  );
}

export function createAdvanceFee(input: {
  studentId: string;
  amount: number;
  method: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
  paidAt: string;
  paidThrough: string;
  note?: string;
}) {
  return api<{ advanceFee: AdvanceFee }>("/advance-fees", { method: "POST", body: input });
}

export function getStudentsForAdvanceFees() {
  return api<{ students: Student[]; total: number }>("/students?take=100");
}

export function addInvoiceItem(invoiceId: string, input: { label: string; amount: number }) {
  return api<{ invoice: Invoice }>(`/invoices/${invoiceId}/items`, {
    method: "POST",
    body: input,
  });
}

export function deleteInvoiceItem(invoiceId: string, index: number) {
  return api<{ invoice: Invoice }>(`/invoices/${invoiceId}/items/${index}`, { method: "DELETE" });
}
