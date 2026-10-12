import { useAuth } from "@/lib/auth";
import { OwnerHome } from "./OwnerHome";
import { StaffHome } from "./StaffHome";
import { StudentHome } from "./StudentHome";
import { ParentHome } from "./ParentHome";

export function RoleHome() {
  const { user } = useAuth();
  if (!user) return null;
  switch (user.role) {
    case "OWNER":
      return <OwnerHome />;
    case "STAFF":
      return <StaffHome name={user.name} />;
    case "GUARD":
      return <StaffHome name={user.name} />;
    case "STUDENT":
      return <StudentHome name={user.name} />;
    case "PARENT":
      return <ParentHome name={user.name} />;
    default:
      return null;
  }
}
