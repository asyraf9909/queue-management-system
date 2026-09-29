"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  Building2,
  Eye,
  Layers3,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  deleteManagementRole,
  deleteManagementBranch,
  deleteManagementCounter,
  deleteManagementGroup,
  listManagementBranches,
  listManagementCounters,
  listManagementGroups,
  deleteManagementUser,
  listManagementReferenceData,
  listManagementRoles,
  listManagementUsers,
  saveManagementRole,
  saveManagementBranch,
  saveManagementCounter,
  saveManagementGroup,
  updateManagementUser,
  type ManagementRole,
  type ManagementUser,
  type ManagementBranch,
  type ManagementCounter,
  type ManagementGroup,
} from "@/lib/admin/operations";
import { inviteStaff } from "@/lib/staff/operations";

type ReferenceData = {
  branches: Array<{ id: string; name: string; code: string }>;
  groups: Array<{ id: string; name: string; branch_id: string | null }>;
  counters: Array<{ id: string; name: string; counter_number: number; branch_id: string; status: string }>;
  roles: Array<{ id: string; name: string; slug: string }>;
  permissions: Array<{ key: string; name: string; description: string }>;
};

type ManagementTab = "users" | "roles" | "branches" | "groups" | "counters";

const demoUsers: ManagementUser[] = [
  { id: "demo-sam", full_name: "Sam Lee", email: "sam@axis.example", role: "ADMIN", role_id: "demo-admin", branch_id: "demo-downtown", group_id: "demo-front-desk", counter_id: "demo-counter-1", counter_number: 1, counter_name: "Counter 01", is_active: true, updated_at: "", branch_name: "Downtown branch", group_name: "Front desk" },
  { id: "demo-alex", full_name: "Alex Tan", email: "alex@axis.example", role: "STAFF", role_id: "demo-staff", branch_id: "demo-downtown", group_id: "demo-front-desk", counter_id: "demo-counter-2", counter_number: 2, counter_name: "Counter 02", is_active: true, updated_at: "", branch_name: "Downtown branch", group_name: "Front desk" },
  { id: "demo-mira", full_name: "Mira Wong", email: "mira@axis.example", role: "STAFF", role_id: "demo-staff", branch_id: "demo-downtown", group_id: null, counter_id: null, counter_number: null, counter_name: null, is_active: false, updated_at: "", branch_name: "Downtown branch", group_name: null },
];

const demoRoles: ManagementRole[] = [
  { id: "demo-admin", name: "Administrator", slug: "ADMIN", description: "Manage an organization and its branches.", is_system: true, is_active: true, permissions: ["users.read", "users.manage", "roles.read", "roles.manage", "branches.manage", "groups.manage", "queue.operate", "reports.read", "settings.manage"], member_count: 1, updated_at: "" },
  { id: "demo-staff", name: "Staff", slug: "STAFF", description: "Operate an assigned branch counter.", is_system: true, is_active: true, permissions: ["queue.operate", "reports.read"], member_count: 2, updated_at: "" },
  { id: "demo-reception", name: "Reception", slug: "reception", description: "Issue tickets and help customers at reception.", is_system: false, is_active: true, permissions: ["users.read", "queue.operate"], member_count: 0, updated_at: "" },
];

const demoBranches: ManagementBranch[] = [
  { id: "demo-downtown", name: "Downtown branch", code: "DOWNTOWN", timezone: "Asia/Kuala_Lumpur", is_active: true, member_count: 3, counter_count: 2, updated_at: "" },
  { id: "demo-north", name: "North academy", code: "NORTH", timezone: "Asia/Kuala_Lumpur", is_active: false, member_count: 0, counter_count: 0, updated_at: "" },
];

const demoGroups: ManagementGroup[] = [
  { id: "demo-front-desk", name: "Front desk", description: "Reception and customer check-in", branch_id: "demo-downtown", branch_name: "Downtown branch", member_count: 2, is_active: true, updated_at: "" },
  { id: "demo-instructors", name: "Instructors", description: "Driving instructors and exam coordinators", branch_id: "demo-downtown", branch_name: "Downtown branch", member_count: 0, is_active: true, updated_at: "" },
];

const demoCounters: ManagementCounter[] = [
  { id: "demo-counter-1", name: "Counter 01", counter_number: 1, branch_id: "demo-downtown", branch_name: "Downtown branch", status: "AVAILABLE", assigned_count: 1, is_active: true, updated_at: "" },
  { id: "demo-counter-2", name: "Counter 02", counter_number: 2, branch_id: "demo-downtown", branch_name: "Downtown branch", status: "SERVING", assigned_count: 1, is_active: true, updated_at: "" },
];

const demoReferences: ReferenceData = {
  branches: [{ id: "demo-downtown", name: "Downtown branch", code: "DOWNTOWN" }],
  groups: [{ id: "demo-front-desk", name: "Front desk", branch_id: "demo-downtown" }],
  roles: [{ id: "demo-admin", name: "Administrator", slug: "ADMIN" }, { id: "demo-staff", name: "Staff", slug: "STAFF" }, { id: "demo-reception", name: "Reception", slug: "reception" }],
  counters: [{ id: "demo-counter-1", name: "Counter 01", counter_number: 1, branch_id: "demo-downtown", status: "AVAILABLE" }, { id: "demo-counter-2", name: "Counter 02", counter_number: 2, branch_id: "demo-downtown", status: "SERVING" }],
  permissions: [
    { key: "users.read", name: "View users", description: "View organization members" },
    { key: "users.manage", name: "Manage users", description: "Invite, edit, deactivate, and remove users" },
    { key: "roles.read", name: "View roles", description: "View roles and permissions" },
    { key: "roles.manage", name: "Manage roles", description: "Create and edit custom roles" },
    { key: "branches.manage", name: "Manage branches", description: "Create and configure branches" },
    { key: "groups.manage", name: "Manage groups", description: "Create and configure staff groups" },
    { key: "queue.operate", name: "Operate queue", description: "Call and complete tickets" },
    { key: "reports.read", name: "View reports", description: "View queue reports" },
    { key: "settings.manage", name: "Manage settings", description: "Edit queue settings" },
  ],
};

type UserSort = "name" | "role" | "branch" | "counter" | "status";
type RoleSort = "name" | "members" | "status";

export default function ManagementView({
  liveMode,
  onNotice,
}: {
  liveMode: boolean;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<ManagementTab>("users");
  const [users, setUsers] = useState<ManagementUser[]>(demoUsers);
  const [roles, setRoles] = useState<ManagementRole[]>(demoRoles);
  const [branches, setBranches] = useState<ManagementBranch[]>(demoBranches);
  const [groups, setGroups] = useState<ManagementGroup[]>(demoGroups);
  const [counters, setCounters] = useState<ManagementCounter[]>(demoCounters);
  const [references, setReferences] = useState<ReferenceData>(demoReferences);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [userSort, setUserSort] = useState<UserSort>("name");
  const [roleSort, setRoleSort] = useState<RoleSort>("name");
  const [selectedUser, setSelectedUser] = useState<ManagementUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<ManagementRole | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<ManagementBranch | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ManagementGroup | null>(null);
  const [selectedCounter, setSelectedCounter] = useState<ManagementCounter | null>(null);
  const [editor, setEditor] = useState<"view-user" | "edit-user" | "view-role" | "edit-role" | "view-branch" | "edit-branch" | "view-group" | "edit-group" | "view-counter" | "edit-counter" | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCounterId, setInviteCounterId] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const notify = useEffectEvent(onNotice);

  async function loadData() {
    if (!liveMode) return;
    try {
      const [nextUsers, nextRoles, nextBranches, nextGroups, nextCounters, nextReferences] = await Promise.all([
        listManagementUsers(),
        listManagementRoles(),
        listManagementBranches(),
        listManagementGroups(),
        listManagementCounters(),
        listManagementReferenceData(),
      ]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setBranches(nextBranches);
      setGroups(nextGroups);
      setCounters(nextCounters);
      setReferences(nextReferences);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to load management data.");
    }
  }

  useEffect(() => {
    if (!liveMode) return;
    let active = true;
    Promise.all([listManagementUsers(), listManagementRoles(), listManagementBranches(), listManagementGroups(), listManagementCounters(), listManagementReferenceData()])
      .then(([nextUsers, nextRoles, nextBranches, nextGroups, nextCounters, nextReferences]) => {
        if (!active) return;
        setUsers(nextUsers);
        setRoles(nextRoles);
        setBranches(nextBranches);
        setGroups(nextGroups);
        setCounters(nextCounters);
        setReferences(nextReferences);
      })
      .catch((error) => {
        if (active) notify(error instanceof Error ? error.message : "Unable to load management data.");
      });
    return () => {
      active = false;
    };
  }, [liveMode]);

  const visibleUsers = [...users]
    .filter((user) => status === "all" || (status === "active" ? user.is_active : !user.is_active))
    .filter((user) => `${user.full_name} ${user.email ?? ""} ${user.role} ${user.branch_name ?? ""} ${user.counter_name ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => {
      const values = {
        name: [left.full_name, right.full_name],
        role: [left.role, right.role],
        branch: [left.branch_name ?? "", right.branch_name ?? ""],
        counter: [left.counter_number ?? 0, right.counter_number ?? 0],
        status: [left.is_active ? "active" : "inactive", right.is_active ? "active" : "inactive"],
      }[userSort];
      return typeof values[0] === "number" && typeof values[1] === "number" ? values[0] - values[1] : String(values[0]).localeCompare(String(values[1]));
    });

  const visibleRoles = [...roles]
    .filter((role) => status === "all" || (status === "active" ? role.is_active : !role.is_active))
    .filter((role) => `${role.name} ${role.slug} ${role.description}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => roleSort === "members" ? right.member_count - left.member_count : roleSort === "status" ? Number(right.is_active) - Number(left.is_active) : left.name.localeCompare(right.name));

  const visibleBranches = [...branches]
    .filter((branch) => status === "all" || (status === "active" ? branch.is_active : !branch.is_active))
    .filter((branch) => `${branch.name} ${branch.code} ${branch.timezone}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleGroups = [...groups]
    .filter((group) => status === "all" || (status === "active" ? group.is_active : !group.is_active))
    .filter((group) => `${group.name} ${group.description} ${group.branch_name ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleCounters = [...counters]
    .filter((counter) => status === "all" || (status === "active" ? counter.is_active : !counter.is_active))
    .filter((counter) => `${counter.name} ${counter.counter_number} ${counter.branch_name ?? ""} ${counter.status}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => left.counter_number - right.counter_number);

  function startUserEditor(user: ManagementUser, mode: "view-user" | "edit-user") {
    setSelectedUser(user);
    setSelectedRole(null);
    setEditor(mode);
  }

  function startRoleEditor(role: ManagementRole | null, mode: "view-role" | "edit-role") {
    setSelectedRole(role);
    setSelectedUser(null);
    setEditor(mode);
  }

  function startBranchEditor(branch: ManagementBranch | null, mode: "view-branch" | "edit-branch") { setSelectedBranch(branch); setSelectedGroup(null); setSelectedCounter(null); setEditor(mode); }
  function startGroupEditor(group: ManagementGroup | null, mode: "view-group" | "edit-group") { setSelectedGroup(group); setSelectedBranch(null); setSelectedCounter(null); setEditor(mode); }
  function startCounterEditor(counter: ManagementCounter | null, mode: "view-counter" | "edit-counter") { setSelectedCounter(counter); setSelectedBranch(null); setSelectedGroup(null); setEditor(mode); }

  async function removeUser(user: ManagementUser) {
    if (!window.confirm(`Delete ${user.full_name}? Their queue history will remain, but their login will be removed.`)) return;
    if (!liveMode) {
      setUsers((current) => current.filter((item) => item.id !== user.id));
      onNotice(`${user.full_name} was removed from the demo workspace.`);
      return;
    }
    setBusy(true);
    try {
      await deleteManagementUser(user.id);
      await loadData();
      onNotice(`${user.full_name} was deleted.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to delete user.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(role: ManagementRole) {
    if (!window.confirm(`Delete the ${role.name} role?`)) return;
    if (!liveMode) {
      setRoles((current) => current.filter((item) => item.id !== role.id));
      onNotice(`${role.name} was removed from the demo workspace.`);
      return;
    }
    setBusy(true);
    try {
      await deleteManagementRole(role.id);
      await loadData();
      onNotice(`${role.name} was deleted.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to delete role.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBranch(branch: ManagementBranch) {
    if (!window.confirm(`Delete ${branch.name}?`)) return;
    if (!liveMode) { setBranches((current) => current.filter((item) => item.id !== branch.id)); onNotice(`${branch.name} was removed from the demo workspace.`); return; }
    setBusy(true);
    try { await deleteManagementBranch(branch.id); await loadData(); onNotice(`${branch.name} was deleted.`); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to delete branch."); } finally { setBusy(false); }
  }

  async function removeGroup(group: ManagementGroup) {
    if (!window.confirm(`Delete ${group.name}?`)) return;
    if (!liveMode) { setGroups((current) => current.filter((item) => item.id !== group.id)); onNotice(`${group.name} was removed from the demo workspace.`); return; }
    setBusy(true);
    try { await deleteManagementGroup(group.id); await loadData(); onNotice(`${group.name} was deleted.`); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to delete group."); } finally { setBusy(false); }
  }

  async function removeCounter(counter: ManagementCounter) {
    if (!window.confirm(`Delete ${counter.name}?`)) return;
    if (!liveMode) { setCounters((current) => current.filter((item) => item.id !== counter.id)); onNotice(`${counter.name} was removed from the demo workspace.`); return; }
    setBusy(true);
    try { await deleteManagementCounter(counter.id); await loadData(); onNotice(`${counter.name} was deleted.`); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to delete counter."); } finally { setBusy(false); }
  }

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!liveMode) {
      onNotice("Demo mode is active. Configure Supabase to invite real users.");
      return;
    }
    setInviteSubmitting(true);
    try {
      const counter = references.counters.find((item) => item.id === inviteCounterId);
      const result = await inviteStaff({ email: inviteEmail, fullName: inviteName, counterNumber: counter?.counter_number ?? null });
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteCounterId("");
      await loadData();
      onNotice(`Invitation sent to ${result.email}.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to invite user.");
    } finally {
      setInviteSubmitting(false);
    }
  }

  return (
    <div className="focused-view management-view">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION <span className="heading-dot">·</span> GOVERNANCE</p>
          <h1>Users & roles</h1>
          <p className="heading-description">Control access across your driving-school organization.</p>
        </div>
        <button className="primary-button" onClick={() => tab === "users" ? setInviteOpen(!inviteOpen) : tab === "roles" ? startRoleEditor(null, "edit-role") : tab === "branches" ? startBranchEditor(null, "edit-branch") : tab === "groups" ? startGroupEditor(null, "edit-group") : startCounterEditor(null, "edit-counter")}>
          <Plus size={15} />
          {tab === "users" ? "Add user" : tab === "roles" ? "New role" : tab === "branches" ? "New branch" : tab === "groups" ? "New group" : "New counter"}
        </button>
      </div>

      {tab === "users" && inviteOpen && <form className="invite-form management-invite-form" onSubmit={submitInvite}>
        <div><strong>Invite a user</strong><span>They will receive a Supabase Auth email.</span></div>
        <input aria-label="Full name" placeholder="Full name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} required />
        <input aria-label="Email address" type="email" placeholder="Email address" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
        <select aria-label="Counter assignment" value={inviteCounterId} onChange={(event) => setInviteCounterId(event.target.value)}><option value="">No counter</option>{references.counters.map((counter) => <option key={counter.id} value={counter.id}>C{String(counter.counter_number).padStart(2, "0")} · {counter.name}</option>)}</select>
        <button className="primary-button" disabled={inviteSubmitting}>{inviteSubmitting ? "Sending..." : "Send invitation"}</button>
      </form>}

      <div className="management-toolbar">
        <div className="management-tabs" role="tablist" aria-label="Management sections">
          <button className={tab === "users" ? "active" : ""} onClick={() => { setTab("users"); setQuery(""); setStatus("all"); }}>Users <strong>{users.length}</strong></button>
          <button className={tab === "roles" ? "active" : ""} onClick={() => { setTab("roles"); setQuery(""); setStatus("all"); }}>Roles <strong>{roles.length}</strong></button>
          <button className={tab === "branches" ? "active" : ""} onClick={() => { setTab("branches"); setQuery(""); setStatus("all"); }}><Building2 size={13} /> Branches <strong>{branches.length}</strong></button>
          <button className={tab === "groups" ? "active" : ""} onClick={() => { setTab("groups"); setQuery(""); setStatus("all"); }}><Layers3 size={13} /> Groups <strong>{groups.length}</strong></button>
          <button className={tab === "counters" ? "active" : ""} onClick={() => { setTab("counters"); setQuery(""); setStatus("all"); }}>Counters <strong>{counters.length}</strong></button>
        </div>
        <label className="management-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${tab}`} aria-label={`Search ${tab}`} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={tab === "users" ? userSort : roleSort} onChange={(event) => tab === "users" ? setUserSort(event.target.value as UserSort) : setRoleSort(event.target.value as RoleSort)} aria-label="Sort table">
          {tab === "users" ? <><option value="name">Sort: Name</option><option value="role">Sort: Role</option><option value="branch">Sort: Branch</option><option value="counter">Sort: Counter</option><option value="status">Sort: Status</option></> : <><option value="name">Sort: Name</option><option value="members">Sort: Members</option><option value="status">Sort: Status</option></>}
        </select>
      </div>

      {tab === "users" ? (
        <section className="panel management-table-panel">
          <div className="management-table-head user-grid"><span>User</span><span>Role</span><span>Branch / group</span><span>Counter</span><span>Status</span><span>Actions</span></div>
          {visibleUsers.length === 0 ? <EmptyState label="No users match this filter." /> : visibleUsers.map((user) => <UserRow key={user.id} user={user} onView={() => startUserEditor(user, "view-user")} onEdit={() => startUserEditor(user, "edit-user")} onDelete={() => void removeUser(user)} />)}
        </section>
      ) : tab === "roles" ? (
        <section className="panel management-table-panel">
          <div className="management-table-head role-grid"><span>Role</span><span>Access</span><span>Members</span><span>Status</span><span>Actions</span></div>
          {visibleRoles.length === 0 ? <EmptyState label="No roles match this filter." /> : visibleRoles.map((role) => <RoleRow key={role.id} role={role} onView={() => startRoleEditor(role, "view-role")} onEdit={() => startRoleEditor(role, "edit-role")} onDelete={() => void removeRole(role)} />)}
        </section>
      ) : null}

      {tab === "branches" && <ResourceTable title="Branch" columns={["Details", "Status"]}>{visibleBranches.map((branch) => <ResourceRow key={branch.id} icon={<Building2 size={16} />} title={branch.name} subtitle={branch.code} detail={`${branch.timezone} · ${branch.member_count} members · ${branch.counter_count} counters`} active={branch.is_active} onView={() => startBranchEditor(branch, "view-branch")} onEdit={() => startBranchEditor(branch, "edit-branch")} onDelete={() => void removeBranch(branch)} />)}</ResourceTable>}
      {tab === "groups" && <ResourceTable title="Group" columns={["Details", "Status"]}>{visibleGroups.map((group) => <ResourceRow key={group.id} icon={<Layers3 size={16} />} title={group.name} subtitle={group.description || "No description"} detail={`${group.branch_name ?? "Organization-wide"} · ${group.member_count} members`} active={group.is_active} onView={() => startGroupEditor(group, "view-group")} onEdit={() => startGroupEditor(group, "edit-group")} onDelete={() => void removeGroup(group)} />)}</ResourceTable>}
      {tab === "counters" && <ResourceTable title="Counter" columns={["Details", "Status"]}>{visibleCounters.map((counter) => <ResourceRow key={counter.id} icon={<Users size={16} />} title={`${counter.name} · C${String(counter.counter_number).padStart(2, "0")}`} subtitle={counter.branch_name ?? "Unassigned branch"} detail={`${counter.assigned_count} assigned users`} active={counter.is_active} status={counter.status} onView={() => startCounterEditor(counter, "view-counter")} onEdit={() => startCounterEditor(counter, "edit-counter")} onDelete={() => void removeCounter(counter)} />)}</ResourceTable>}

      {editor === "view-user" && selectedUser && <UserDetails user={selectedUser} onClose={() => setEditor(null)} onEdit={() => setEditor("edit-user")} />}
      {editor === "edit-user" && selectedUser && <UserForm user={selectedUser} references={references} busy={busy} liveMode={liveMode} onClose={() => setEditor(null)} onNotice={onNotice} onSaved={() => { setEditor(null); void loadData(); }} />}
      {editor === "view-role" && selectedRole && <RoleDetails role={selectedRole} references={references} onClose={() => setEditor(null)} onEdit={() => setEditor("edit-role")} />}
      {editor === "edit-role" && <RoleForm role={selectedRole} references={references} busy={busy} liveMode={liveMode} onClose={() => setEditor(null)} onNotice={onNotice} onSaved={() => { setEditor(null); void loadData(); }} />}
      {editor === "view-branch" && selectedBranch && <ResourceDetails title="Branch details" values={[["Name", selectedBranch.name], ["Code", selectedBranch.code], ["Timezone", selectedBranch.timezone], ["Members", String(selectedBranch.member_count)], ["Counters", String(selectedBranch.counter_count)], ["Status", selectedBranch.is_active ? "Active" : "Inactive"]]} onClose={() => setEditor(null)} onEdit={() => setEditor("edit-branch")} />}
      {editor === "edit-branch" && <BranchForm branch={selectedBranch} busy={busy} liveMode={liveMode} onClose={() => setEditor(null)} onNotice={onNotice} onSaved={() => { setEditor(null); void loadData(); }} />}
      {editor === "view-group" && selectedGroup && <ResourceDetails title="Group details" values={[["Name", selectedGroup.name], ["Description", selectedGroup.description || "No description"], ["Branch", selectedGroup.branch_name ?? "Organization-wide"], ["Members", String(selectedGroup.member_count)], ["Status", selectedGroup.is_active ? "Active" : "Inactive"]]} onClose={() => setEditor(null)} onEdit={() => setEditor("edit-group")} />}
      {editor === "edit-group" && <GroupForm group={selectedGroup} references={references} busy={busy} liveMode={liveMode} onClose={() => setEditor(null)} onNotice={onNotice} onSaved={() => { setEditor(null); void loadData(); }} />}
      {editor === "view-counter" && selectedCounter && <ResourceDetails title="Counter details" values={[["Name", selectedCounter.name], ["Number", `C${String(selectedCounter.counter_number).padStart(2, "0")}`], ["Branch", selectedCounter.branch_name ?? "Unassigned"], ["Assigned users", String(selectedCounter.assigned_count)], ["Status", selectedCounter.status], ["Active", selectedCounter.is_active ? "Yes" : "No"]]} onClose={() => setEditor(null)} onEdit={() => setEditor("edit-counter")} />}
      {editor === "edit-counter" && <CounterForm counter={selectedCounter} references={references} busy={busy} liveMode={liveMode} onClose={() => setEditor(null)} onNotice={onNotice} onSaved={() => { setEditor(null); void loadData(); }} />}
    </div>
  );
}

function UserRow({ user, onView, onEdit, onDelete }: { user: ManagementUser; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="management-table-row user-grid"><div className="management-person"><span className="profile-avatar staff-avatar">{user.full_name.charAt(0)}</span><div><strong>{user.full_name}</strong><span>{user.email ?? "No email address"}</span></div></div><span className="role-label">{user.role}</span><div className="branch-label"><strong>{user.branch_name ?? "Unassigned"}</strong><span>{user.group_name ?? "No group"}</span></div><span className="counter-label">{user.counter_number ? `C${String(user.counter_number).padStart(2, "0")}` : "No counter"}</span><StatusBadge active={user.is_active} /><ActionButtons onView={onView} onEdit={onEdit} onDelete={onDelete} /> </div>;
}

function RoleRow({ role, onView, onEdit, onDelete }: { role: ManagementRole; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="management-table-row role-grid"><div className="role-person"><span className="role-icon"><ShieldCheck size={16} /></span><div><strong>{role.name}</strong><span>{role.slug}{role.is_system ? " · System role" : " · Custom role"}</span></div></div><span className="permission-count">{role.permissions.length} permissions</span><span className="member-count"><Users size={14} /> {role.member_count}</span><StatusBadge active={role.is_active} /><ActionButtons onView={onView} onEdit={onEdit} onDelete={onDelete} deleteDisabled={role.is_system} /> </div>;
}

function ActionButtons({ onView, onEdit, onDelete, deleteDisabled = false }: { onView: () => void; onEdit: () => void; onDelete: () => void; deleteDisabled?: boolean }) {
  return <div className="management-actions"><button onClick={onView} title="View details" aria-label="View details"><Eye size={15} /></button><button onClick={onEdit} title="Edit" aria-label="Edit"><Pencil size={15} /></button><button onClick={onDelete} title={deleteDisabled ? "System roles cannot be deleted" : "Delete"} aria-label="Delete" disabled={deleteDisabled}><Trash2 size={15} /></button></div>;
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return <span className={`management-status ${active ? "active" : "inactive"}`}><span />{label ?? (active ? "Active" : "Inactive")}</span>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="management-empty">{label}</div>;
}

function ResourceTable({ title, columns, children }: { title: string; columns: string[]; children: React.ReactNode }) {
  return <section className="panel management-table-panel resource-table"><div className="management-table-head resource-grid"><span>{title}</span>{columns.map((column) => <span key={column}>{column}</span>)}<span>Actions</span></div>{children}</section>;
}

function ResourceRow({ icon, title, subtitle, detail, active, status, onView, onEdit, onDelete }: { icon: React.ReactNode; title: string; subtitle: string; detail: string; active: boolean; status?: string; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const isAvailable = active && status !== "OFFLINE";
  return <div className="management-table-row resource-grid"><div className="resource-person"><span className="resource-icon">{icon}</span><div><strong>{title}</strong><span>{subtitle}</span></div></div><span className="resource-detail">{detail}</span><StatusBadge active={isAvailable} label={status && status !== "AVAILABLE" ? status : undefined} /><ActionButtons onView={onView} onEdit={onEdit} onDelete={onDelete} /></div>;
}

function ResourceDetails({ title, values, onClose, onEdit }: { title: string; values: string[][]; onClose: () => void; onEdit: () => void }) {
  return <DetailsPanel title={title} onClose={onClose} action={<button className="secondary-button" onClick={onEdit}><Pencil size={14} /> Edit</button>}>{values.map(([label, value]) => <DetailItem key={label} label={label} value={value} />)}</DetailsPanel>;
}

function UserDetails({ user, onClose, onEdit }: { user: ManagementUser; onClose: () => void; onEdit: () => void }) {
  return <DetailsPanel title="User details" onClose={onClose} action={<button className="secondary-button" onClick={onEdit}><Pencil size={14} /> Edit user</button>}><DetailItem label="Name" value={user.full_name} /><DetailItem label="Email" value={user.email ?? "No email address"} /><DetailItem label="Role" value={user.role} /><DetailItem label="Branch" value={user.branch_name ?? "Unassigned"} /><DetailItem label="Group" value={user.group_name ?? "No group"} /><DetailItem label="Counter" value={user.counter_name ?? "No counter"} /><DetailItem label="Status" value={user.is_active ? "Active" : "Inactive"} /></DetailsPanel>;
}

function RoleDetails({ role, references, onClose, onEdit }: { role: ManagementRole; references: ReferenceData; onClose: () => void; onEdit: () => void }) {
  const permissionNames = new Map(references.permissions.map((permission) => [permission.key, permission.name]));
  return <DetailsPanel title="Role details" onClose={onClose} action={<button className="secondary-button" onClick={onEdit}><Pencil size={14} /> Edit role</button>}><DetailItem label="Name" value={role.name} /><DetailItem label="Identifier" value={role.slug} /><DetailItem label="Members" value={String(role.member_count)} /><div className="detail-block"><span>Permissions</span><div className="permission-list">{role.permissions.map((permission) => <span key={permission}>{permissionNames.get(permission) ?? permission}</span>)}</div></div></DetailsPanel>;
}

function DetailsPanel({ title, action, onClose, children }: { title: string; action: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return <div className="details-panel"><div className="details-heading"><div><p className="eyebrow">RECORD</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></div><div className="details-grid">{children}</div><div className="details-footer">{action}</div></div>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="detail-block"><span>{label}</span><strong>{value}</strong></div>;
}

function UserForm({ user, references, busy, liveMode, onClose, onNotice, onSaved }: { user: ManagementUser; references: ReferenceData; busy: boolean; liveMode: boolean; onClose: () => void; onNotice: (message: string) => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [roleId, setRoleId] = useState(user.role_id ?? references.roles[0]?.id ?? "");
  const [branchId, setBranchId] = useState(user.branch_id ?? "");
  const [groupId, setGroupId] = useState(user.group_id ?? "");
  const [counterId, setCounterId] = useState(user.counter_id ?? "");
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const groups = references.groups.filter((group) => !branchId || group.branch_id === branchId);
  const counters = references.counters.filter((counter) => !branchId || counter.branch_id === branchId);

  async function save() {
    if (!roleId) { onNotice("Choose a role before saving."); return; }
    if (!liveMode) {
      onNotice(`${fullName} was updated in the demo workspace.`);
      onSaved();
      return;
    }
    setSaving(true);
    try {
      await updateManagementUser({ userId: user.id, fullName, roleId, branchId: branchId || null, groupId: groupId || null, counterId: counterId || null, isActive });
      onNotice(`${fullName} was updated.`);
      onSaved();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to update user.");
    } finally { setSaving(false); }
  }

  return <DetailsPanel title="Edit user" onClose={onClose} action={<button className="primary-button" onClick={() => void save()} disabled={saving || busy}>{saving ? "Saving..." : "Save changes"}</button>}><label className="detail-field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label className="detail-field"><span>Role</span><select value={roleId} onChange={(event) => setRoleId(event.target.value)}>{references.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="detail-field"><span>Branch</span><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setGroupId(""); setCounterId(""); }}><option value="">Unassigned</option>{references.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className="detail-field"><span>Group</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="detail-field"><span>Counter</span><select value={counterId} onChange={(event) => setCounterId(event.target.value)}><option value="">No counter</option>{counters.map((counter) => <option key={counter.id} value={counter.id}>C{String(counter.counter_number).padStart(2, "0")} · {counter.name}</option>)}</select></label><label className="detail-toggle"><span>Account active</span><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span className="toggle-track" /></label></DetailsPanel>;
}

function RoleForm({ role, references, busy, liveMode, onClose, onNotice, onSaved }: { role: ManagementRole | null; references: ReferenceData; busy: boolean; liveMode: boolean; onClose: () => void; onNotice: (message: string) => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [slug, setSlug] = useState(role?.slug.toLowerCase() ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissionKeys, setPermissionKeys] = useState(role?.permissions ?? []);
  const [saving, setSaving] = useState(false);

  function togglePermission(key: string) {
    setPermissionKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function save() {
    if (!name.trim() || !slug.trim()) { onNotice("Role name and identifier are required."); return; }
    if (!liveMode) { onNotice(`${name} was saved in the demo workspace.`); onSaved(); return; }
    setSaving(true);
    try {
      await saveManagementRole({ roleId: role?.id, name, slug, description, permissionKeys });
      onNotice(`${name} was saved.`);
      onSaved();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unable to save role.");
    } finally { setSaving(false); }
  }

  return <DetailsPanel title={role ? "Edit role" : "New role"} onClose={onClose} action={<button className="primary-button" onClick={() => void save()} disabled={saving || busy}>{saving ? "Saving..." : "Save role"}</button>}><label className="detail-field"><span>Role name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="detail-field"><span>Identifier</span><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} disabled={Boolean(role?.is_system)} /></label><label className="detail-field detail-field-wide"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><div className="permission-editor"><span>Permissions</span>{references.permissions.map((permission) => <label key={permission.key} className="permission-option"><input type="checkbox" checked={permissionKeys.includes(permission.key)} onChange={() => togglePermission(permission.key)} /><span><strong>{permission.name}</strong><small>{permission.description}</small></span></label>)}</div></DetailsPanel>;
}

function BranchForm({ branch, busy, liveMode, onClose, onNotice, onSaved }: { branch: ManagementBranch | null; busy: boolean; liveMode: boolean; onClose: () => void; onNotice: (message: string) => void; onSaved: () => void }) {
  const [name, setName] = useState(branch?.name ?? "");
  const [code, setCode] = useState(branch?.code ?? "");
  const [timezone, setTimezone] = useState(branch?.timezone ?? "Asia/Kuala_Lumpur");
  const [isActive, setIsActive] = useState(branch?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !code.trim()) { onNotice("Branch name and code are required."); return; }
    if (!liveMode) { onNotice(`${name} was saved in the demo workspace.`); onSaved(); return; }
    setSaving(true);
    try { await saveManagementBranch({ branchId: branch?.id, name, code, timezone, isActive }); onNotice(`${name} was saved.`); onSaved(); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to save branch."); } finally { setSaving(false); }
  }

  return <DetailsPanel title={branch ? "Edit branch" : "New branch"} onClose={onClose} action={<button className="primary-button" onClick={() => void save()} disabled={saving || busy}>{saving ? "Saving..." : "Save branch"}</button>}><label className="detail-field"><span>Branch name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="North academy" /></label><label className="detail-field"><span>Branch code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="NORTH" /></label><label className="detail-field"><span>Timezone</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><label className="detail-toggle"><span>Branch active</span><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span className="toggle-track" /></label></DetailsPanel>;
}

function GroupForm({ group, references, busy, liveMode, onClose, onNotice, onSaved }: { group: ManagementGroup | null; references: ReferenceData; busy: boolean; liveMode: boolean; onClose: () => void; onNotice: (message: string) => void; onSaved: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [branchId, setBranchId] = useState(group?.branch_id ?? "");
  const [isActive, setIsActive] = useState(group?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { onNotice("Group name is required."); return; }
    if (!liveMode) { onNotice(`${name} was saved in the demo workspace.`); onSaved(); return; }
    setSaving(true);
    try { await saveManagementGroup({ groupId: group?.id, name, description, branchId: branchId || null, isActive }); onNotice(`${name} was saved.`); onSaved(); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to save group."); } finally { setSaving(false); }
  }

  return <DetailsPanel title={group ? "Edit group" : "New group"} onClose={onClose} action={<button className="primary-button" onClick={() => void save()} disabled={saving || busy}>{saving ? "Saving..." : "Save group"}</button>}><label className="detail-field"><span>Group name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Instructors" /></label><label className="detail-field"><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Organization-wide</option>{references.branches.map((branchOption) => <option key={branchOption.id} value={branchOption.id}>{branchOption.name}</option>)}</select></label><label className="detail-field detail-field-wide"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><label className="detail-toggle"><span>Group active</span><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span className="toggle-track" /></label></DetailsPanel>;
}

function CounterForm({ counter, references, busy, liveMode, onClose, onNotice, onSaved }: { counter: ManagementCounter | null; references: ReferenceData; busy: boolean; liveMode: boolean; onClose: () => void; onNotice: (message: string) => void; onSaved: () => void }) {
  const [name, setName] = useState(counter?.name ?? "");
  const [counterNumber, setCounterNumber] = useState(String(counter?.counter_number ?? ""));
  const [branchId, setBranchId] = useState(counter?.branch_id ?? references.branches[0]?.id ?? "");
  const [status, setStatus] = useState<"AVAILABLE" | "SERVING" | "OFFLINE">(counter?.status ?? "AVAILABLE");
  const [isActive, setIsActive] = useState(counter?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !branchId || !Number(counterNumber)) { onNotice("Counter name, number, and branch are required."); return; }
    if (!liveMode) { onNotice(`${name} was saved in the demo workspace.`); onSaved(); return; }
    setSaving(true);
    try { await saveManagementCounter({ counterId: counter?.id, name, counterNumber: Number(counterNumber), branchId, status, isActive }); onNotice(`${name} was saved.`); onSaved(); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to save counter."); } finally { setSaving(false); }
  }

  return <DetailsPanel title={counter ? "Edit counter" : "New counter"} onClose={onClose} action={<button className="primary-button" onClick={() => void save()} disabled={saving || busy}>{saving ? "Saving..." : "Save counter"}</button>}><label className="detail-field"><span>Counter name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Counter 05" /></label><label className="detail-field"><span>Number</span><input type="number" min="1" value={counterNumber} onChange={(event) => setCounterNumber(event.target.value)} /></label><label className="detail-field"><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{references.branches.map((branchOption) => <option key={branchOption.id} value={branchOption.id}>{branchOption.name}</option>)}</select></label><label className="detail-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as "AVAILABLE" | "SERVING" | "OFFLINE")}><option value="AVAILABLE">Available</option><option value="SERVING">Serving</option><option value="OFFLINE">Offline</option></select></label><label className="detail-toggle"><span>Counter active</span><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span className="toggle-track" /></label></DetailsPanel>;
}