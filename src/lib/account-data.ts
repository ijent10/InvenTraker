import type { Employee } from "@/lib/demo-data"
import { currentSession } from "@/lib/permissions"
import { getEmployees } from "@/lib/server-data"

export const emptyEmployee: Employee = {
  id: "new-employee",
  name: "",
  employeeId: "",
  phone: "",
  email: "",
  jobTitle: "",
  department: "",
  location: "",
  store: "",
  status: "Invite sent",
  lastActive: "Not active yet",
  permissions: []
}

export async function getCurrentEmployee() {
  const employees = await getEmployees()
  return employees.find((candidate) => candidate.id === currentSession.userId) ?? employees[0] ?? emptyEmployee
}
