import { api } from "./api";
import type {
  Admission,
  AdmissionStatusResult,
  AppNotification,
  Bed,
  DocumentFile,
  Leave,
  LeaveTarget,
  ManagedUser,
  Message,
  MessageListResult,
  Payment,
  Property,
  PublicPg,
  Room,
  StatusVideo,
  Student,
  TenantBranding,
  TenantImage,
  UserDetail,
} from "./types";

export function getProperties() {
  return api<{ properties: Property[] }>("/properties");
}

export function createRoom(input: {
  propertyId: string;
  roomNumber: string;
  floor?: number;
  capacity?: number;
  gender?: string;
  rentAmount?: number;
  bedCount?: number;
}) {
  return api<{ room: Room }>("/rooms", { method: "POST", body: input });
}

export function addBed(roomId: string, label: string) {
  return api<{ bed: Bed }>(`/rooms/${roomId}/beds`, { method: "POST", body: { label } });
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
  return api<{ ok: boolean; needsEmail: boolean; devLink?: string | null }>("/auth/forgot-password", {
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

export function createStudentLogin(input: { studentId: string; email: string; password?: string }) {
  return api<{ user: ManagedUser; temporaryPassword?: string }>("/users/students", {
    method: "POST",
    body: input,
  });
}

export function getUser(id: string) {
  return api<{ user: UserDetail }>(`/users/${id}`);
}

export function updateUser(id: string, body: Record<string, unknown>) {
  return api<{ user: UserDetail }>(`/users/${id}`, { method: "PATCH", body });
}

export interface CreateStudentInput {
  firstName: string;
  lastName?: string;
  phone?: string;
  address?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  photoUrl?: string;
  roomId?: string;
  bedId?: string;
}

export function createStudent(input: CreateStudentInput) {
  return api<{ student: Student }>("/students", { method: "POST", body: input });
}

export function updateStudent(id: string, body: Record<string, unknown>) {
  return api<{ student: Student }>(`/students/${id}`, { method: "PATCH", body });
}

export function uploadDocument(input: {
  studentId?: string;
  userId?: string;
  type?: string;
  title?: string;
  dataUrl: string;
  mimeType?: string;
}) {
  return api<{ document: DocumentFile }>("/documents", { method: "POST", body: input });
}

export function deleteDocument(id: string) {
  return api<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" });
}

export function getTenant() {
  return api<{ tenant: TenantBranding }>("/tenant");
}

export function updateTenant(body: Record<string, unknown>) {
  return api<{ tenant: TenantBranding }>("/tenant", { method: "PATCH", body });
}

export function addTenantImage(input: { dataUrl: string; caption?: string }) {
  return api<{ image: TenantImage }>("/tenant/images", { method: "POST", body: input });
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

export function getPublicPg() {
  return api<{ pg: PublicPg }>("/admissions/pg", { auth: false });
}

export interface AdmissionDocumentInput {
  type: string;
  title?: string;
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
  password: string;
  documents: AdmissionDocumentInput[];
}

export function submitAdmission(input: ApplyAdmissionInput) {
  return api<{ admission: { id: string; status: string } }>("/admissions", {
    method: "POST",
    body: input,
    auth: false,
  });
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

export function approveAdmission(id: string, body: { roomId?: string; bedId?: string }) {
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
  return api<{ video: StatusVideo }>("/status-videos", {
    method: "POST",
    body: { dataUrl, studentId: input.studentId, direction: input.direction, mimeType },
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
