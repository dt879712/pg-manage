export type Role = "OWNER" | "STAFF" | "GUARD" | "STUDENT" | "PARENT";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  tenantId: string | null;
}

export interface Property {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  status: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  floor?: number | null;
  capacity: number;
  status: string;
  rentAmount?: number | null;
  beds?: Bed[];
  _count?: { students: number };
}

export interface Bed {
  id: string;
  label: string;
  status: string;
  roomId: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  status: string;
  room?: { roomNumber: string } | null;
  bed?: { label: string } | null;
  roomId?: string | null;
  bedId?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
}

export interface StudentDetail extends Student {
  room?: { roomNumber: string } | null;
  bed?: { label: string } | null;
  invoices?: Invoice[];
  documents?: DocumentFile[];
  userId?: string | null;
}

export interface Attendance {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  at: string;
  student?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    room?: { roomNumber: string } | null;
  } | null;
}

export interface Invoice {
  id: string;
  studentId: string;
  title: string;
  amount: number;
  status: string;
  periodMonth?: number | null;
  periodYear?: number | null;
  dueDate?: string | null;
  createdAt: string;
  payments?: Payment[];
  student?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    room?: { roomNumber: string } | null;
  } | null;
}

export interface Payment {
  id: string;
  amount: number;
  method?: string | null;
  paidAt: string;
}

export interface RosterStudent {
  id: string;
  firstName: string;
  room?: { roomNumber: string } | null;
  currentStatus?: "CHECK_IN" | "CHECK_OUT" | "NONE";
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  photoUrl?: string | null;
  role: Role;
  isActive: boolean;
  tenantId?: string | null;
}

export interface DocumentFile {
  id: string;
  type: string;
  title?: string | null;
  fileUrl: string;
  mimeType?: string | null;
  createdAt: string;
}

export interface UserDetail extends ManagedUser {
  documents?: DocumentFile[];
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count?: { users: number; students: number; properties: number };
}

export interface TenantImage {
  id: string;
  imageUrl: string;
  caption?: string | null;
  order: number;
}

export interface TenantBranding {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  description?: string | null;
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
  status: string;
  images: TenantImage[];
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  audience: string;
  createdAt: string;
  readAt?: string | null;
}

export type AdmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PublicPg {
  id: string;
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface Admission {
  id: string;
  status: AdmissionStatus;
  firstName: string;
  lastName?: string | null;
  gender?: string | null;
  dob?: string | null;
  phone: string;
  email: string;
  address?: string | null;
  course?: string | null;
  college?: string | null;
  note?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  room?: { roomNumber: string } | null;
  bed?: { label: string } | null;
  roomId?: string | null;
  bedId?: string | null;
  studentId?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  documents?: DocumentFile[];
}

export interface AdmissionStatusResult {
  status: AdmissionStatus;
  firstName: string;
  roomNumber: string | null;
  bedLabel: string | null;
  rejectionReason?: string | null;
  submittedAt: string;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type LeaveType = "SICK" | "PERSONAL" | "HOME" | "EMERGENCY" | "OTHER";

export interface Leave {
  id: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  status: LeaveStatus;
  createdAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  applicant?: { id: string; name: string; role: Role; email?: string } | null;
  student?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    room?: { roomNumber: string } | null;
  } | null;
  reviewedBy?: { id: string; name: string } | null;
}

export interface LeaveTarget {
  id: string;
  name: string;
}

export interface MessageSender {
  id: string;
  name: string;
  role: Role;
  email?: string | null;
  phone?: string | null;
  studentProfile?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    room?: { roomNumber: string } | null;
  } | null;
  parentLinks?: {
    relation?: string | null;
    student: {
      id: string;
      firstName: string;
      lastName?: string | null;
      room?: { roomNumber: string } | null;
    };
  }[];
}

export interface Message {
  id: string;
  subject?: string | null;
  body: string;
  readAt?: string | null;
  createdAt: string;
  sender?: MessageSender | null;
}

export interface MessageListResult {
  messages: Message[];
  total: number;
  unread: number;
}

export interface StatusVideo {
  id: string;
  studentId: string;
  direction: "CHECK_IN" | "CHECK_OUT";
  createdAt: string;
  url: string | null;
  student?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    room?: { roomNumber: string } | null;
  } | null;
}
