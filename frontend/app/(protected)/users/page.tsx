"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import FormCheckbox from "@/components/form/FormCheckbox";
import FormInput from "@/components/form/FormInput";
import FormLabel from "@/components/form/FormLabel";
import FormOptionCheckbox from "@/components/form/FormOptionCheckbox";
import FormSelect from "@/components/form/FormSelect";

interface Role {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  email_verified_at: string | null;
  roles: Role[];
}

interface PaginatedUsersResponse {
  data: User[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface PaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  from: number | null;
  to: number | null;
}

const DEFAULT_PER_PAGE = 10;

const normalizePage = (rawPage: string | null): number => {
  const page = Number(rawPage ?? "1");

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
};

export default function UsersManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterVerified, setFilterVerified] = useState("all");

  const [pagination, setPagination] = useState<PaginationMeta>({
    currentPage: 1,
    lastPage: 1,
    perPage: DEFAULT_PER_PAGE,
    total: 0,
    from: null,
    to: null,
  });

  const isEditMode = useMemo(() => editingId !== null, [editingId]);
  const searchParamsString = searchParams.toString();

  const updateQueryParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParamsString);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
          return;
        }

        params.set(key, String(value));
      });

      const nextQueryString = params.toString();
      const nextUrl = nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
      const currentUrl = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;

      if (nextUrl !== currentUrl) {
        router.push(nextUrl);
      }
    },
    [pathname, router, searchParamsString]
  );

  const loadRoles = useCallback(async () => {
    try {
      const response = await api.get<Role[]>("/admin/roles");
      setRoles(response.data);
    } catch {
      setRoles([]);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams(searchParamsString);
    const searchValue = (params.get("search") ?? "").trim();
    const roleValue = params.get("role") ?? "";
    const verifiedValue = params.get("verified") ?? "";
    const pageValue = normalizePage(params.get("page"));

    const requestParams: Record<string, string | number> = {
      page: pageValue,
      per_page: DEFAULT_PER_PAGE,
    };

    if (searchValue !== "") {
      requestParams.search = searchValue;
    }

    if (roleValue !== "" && roleValue !== "all") {
      requestParams.role = roleValue;
    }

    if (verifiedValue === "verified" || verifiedValue === "unverified") {
      requestParams.verified = verifiedValue;
    }

    try {
      const response = await api.get<PaginatedUsersResponse>("/admin/users", {
        params: requestParams,
      });

      setUsers(response.data.data);
      setErrors((previous) => {
        if (!previous.general) {
          return previous;
        }

        const next = { ...previous };
        delete next.general;
        return next;
      });
      setPagination({
        currentPage: response.data.current_page,
        lastPage: response.data.last_page,
        perPage: response.data.per_page,
        total: response.data.total,
        from: response.data.from,
        to: response.data.to,
      });
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setUsers([]);
      setPagination((previous) => ({
        ...previous,
        currentPage: 1,
        lastPage: 1,
        total: 0,
        from: null,
        to: null,
      }));
      setErrors((previous) => ({
        ...previous,
        general: [axiosError.response?.data?.message || "Failed to load users"],
      }));
    } finally {
      setLoading(false);
    }
  }, [searchParamsString]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const urlSearch = params.get("search") ?? "";
    const urlRole = params.get("role") ?? "all";
    const urlVerified = params.get("verified");

    setFilterSearch(urlSearch);
    setFilterRole(urlRole || "all");
    setFilterVerified(urlVerified === "verified" || urlVerified === "unverified" ? urlVerified : "all");
  }, [searchParamsString]);

  const resetForm = (closeForm = false) => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPassword("");
    setPasswordConfirmation("");
    setEmailVerified(false);
    setSelectedRoles([]);
    setErrors({});

    if (closeForm) {
      setShowForm(false);
    }
  };

  const toggleForm = () => {
    if (showForm) {
      resetForm(true);
      return;
    }

    setShowForm(true);
  };

  const toggleRole = (roleName: string) => {
    setSelectedRoles((previous) =>
      previous.includes(roleName) ? previous.filter((item) => item !== roleName) : [...previous, roleName]
    );
  };

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();

    updateQueryParams({
      search: filterSearch.trim() || null,
      role: filterRole,
      verified: filterVerified,
      page: 1,
    });
  };

  const handleFilterReset = () => {
    setFilterSearch("");
    setFilterRole("all");
    setFilterVerified("all");

    updateQueryParams({
      search: null,
      role: null,
      verified: null,
      page: null,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});

    const clientErrors: Record<string, string[]> = {};

    if (!isEditMode && password.trim() === "") {
      clientErrors.password = ["Password is required"];
    }

    if (password.trim() !== "" && password !== passwordConfirmation) {
      clientErrors.password_confirmation = ["Password confirmation does not match"];
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);

    const payload: {
      name: string;
      email: string;
      email_verified: boolean;
      roles: string[];
      password?: string;
      password_confirmation?: string;
    } = {
      name,
      email,
      email_verified: emailVerified,
      roles: selectedRoles,
    };

    if (password.trim() !== "") {
      payload.password = password;
      payload.password_confirmation = passwordConfirmation;
    }

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/users/${editingId}`, payload);
      } else {
        await api.post("/admin/users", payload);
      }

      resetForm(true);
      await loadUsers();
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to save user"] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setShowForm(true);
    setEditingId(user.id);
    setName(user.name);
    setEmail(user.email);
    setPassword("");
    setPasswordConfirmation("");
    setEmailVerified(Boolean(user.email_verified_at));
    setSelectedRoles(user.roles.map((role) => role.name));
    setErrors({});
  };

  const handleDelete = async (userId: number) => {
    if (!window.confirm("Delete this user?")) {
      return;
    }

    try {
      await api.delete(`/admin/users/${userId}`);
      await loadUsers();
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrors({ general: [axiosError.response?.data?.message || "Failed to delete user"] });
    }
  };

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.lastPage || page === pagination.currentPage) {
      return;
    }

    updateQueryParams({ page });
  };

  const visiblePages = useMemo(() => {
    const start = Math.max(1, pagination.currentPage - 2);
    const end = Math.min(pagination.lastPage, pagination.currentPage + 2);
    const pages: number[] = [];

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [pagination.currentPage, pagination.lastPage]);

  return (
    <ProtectedShell title="User Management" description="Create, Update, Delete users">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
              <p className="text-sm text-slate-500">Create, Update, Delete users</p>
            </div>
            <Button type="button" onClick={toggleForm} variant="secondary" size="md">
              {showForm ? "Close" : "Create User"}
            </Button>
          </div>
        </section>

        <div
          aria-hidden={!showForm}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${showForm ? "max-h-[1400px] opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"}`}
        >
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
            <h3 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update User Form" : "Add User Form"}</h3>

            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <FormInput
                id="user-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter full name"
                error={errors.name?.[0]}
              />

              <FormInput
                id="user-email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                error={errors.email?.[0]}
              />

              <FormInput
                id="user-password"
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isEditMode ? "Leave blank to keep current" : "At least 8 characters"}
                error={errors.password?.[0]}
              />

              <FormInput
                id="user-password-confirmation"
                label="Confirmation Password"
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="Re-enter password"
                error={errors.password_confirmation?.[0]}
              />

              <div className="md:col-span-2">
                <FormCheckbox
                  name="email_verified"
                  label="Email Verified At"
                  checked={emailVerified}
                  onChange={(event) => setEmailVerified(event.target.checked)}
                  description="Enable this to mark the user email as verified."
                  error={errors.email_verified?.[0] || errors.email_verified_at?.[0]}
                />
              </div>

              <div className="md:col-span-2">
                <FormLabel text="Role" />
                <div className="mt-1.5 grid gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.length === 0 && <p className="text-xs text-slate-500">No roles found</p>}
                  {roles.map((role) => (
                    <FormOptionCheckbox
                      key={role.id}
                      label={role.name}
                      checked={selectedRoles.includes(role.name)}
                      onChange={() => toggleRole(role.name)}
                    />
                  ))}
                </div>
                {errors.roles?.[0] && <p className="mt-1 text-xs text-rose-600">{errors.roles[0]}</p>}
              </div>

              {errors.general && <p className="text-xs text-amber-600 md:col-span-2">{errors.general[0]}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={submitting} loading={submitting} className="w-full sm:w-auto" size="lg">
                  {isEditMode ? "Update User" : "Create User"}
                </Button>
                <Button
                  type="button"
                  onClick={() => resetForm(true)}
                  variant="outline"
                  size="lg"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Filter Users</h2>
          <form onSubmit={handleFilterSubmit} className="mt-4 flex flex-wrap items-end gap-3">
            <FormInput
              id="filter-search"
              label="Search"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search by name or email"
              containerClassName="w-full lg:min-w-[320px] lg:flex-[2]"
            />

            <FormSelect
              id="filter-role"
              label="Role"
              value={filterRole}
              onChange={(event) => setFilterRole(event.target.value)}
              options={[
                { label: "All roles", value: "all" },
                ...roles.map((role) => ({ label: role.name, value: role.name })),
              ]}
              containerClassName="w-full sm:w-[220px] lg:flex-1"
            />

            <FormSelect
              id="filter-verified"
              label="Email Verified"
              value={filterVerified}
              onChange={(event) => setFilterVerified(event.target.value)}
              options={[
                { label: "All users", value: "all" },
                { label: "Verified", value: "verified" },
                { label: "Unverified", value: "unverified" },
              ]}
              containerClassName="w-full sm:w-[220px] lg:flex-1"
            />

            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="submit" size="lg" className="w-full sm:w-auto whitespace-nowrap">
                Apply Filters
              </Button>
              <Button
                type="button"
                onClick={handleFilterReset}
                variant="outline"
                size="lg"
                className="w-full sm:w-auto whitespace-nowrap"
              >
                Reset
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Users Table</h2>
            <p className="text-xs text-slate-500">
              Showing {pagination.from ?? 0}-{pagination.to ?? 0} of {pagination.total}
            </p>
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading users...</p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-2 py-2 font-medium">Name</th>
                      <th className="px-2 py-2 font-medium">Email</th>
                      <th className="px-2 py-2 font-medium">Email Verified</th>
                      <th className="px-2 py-2 font-medium">Role</th>
                      <th className="px-2 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-sm text-slate-500">
                          No users found for selected filters.
                        </td>
                      </tr>
                    )}

                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 text-slate-700">
                        <td className="px-2 py-2">{user.name}</td>
                        <td className="px-2 py-2">{user.email}</td>
                        <td className="px-2 py-2 text-xs">
                          {user.email_verified_at ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">Verified</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Not verified</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length === 0 && <span className="text-xs text-slate-400">No role</span>}
                            {user.roles.map((role) => (
                              <span key={role.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                {role.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => handleEdit(user)}
                              variant="outline"
                              size="sm"
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              onClick={() => handleDelete(user.id)}
                              variant="danger"
                              size="sm"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Page {pagination.currentPage} of {pagination.lastPage || 1}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => goToPage(pagination.currentPage - 1)}
                    disabled={pagination.currentPage <= 1}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>

                  {visiblePages.map((page) => (
                    <Button
                      key={page}
                      type="button"
                      onClick={() => goToPage(page)}
                      variant={page === pagination.currentPage ? "primary" : "outline"}
                      size="sm"
                    >
                      {page}
                    </Button>
                  ))}

                  <Button
                    type="button"
                    onClick={() => goToPage(pagination.currentPage + 1)}
                    disabled={pagination.currentPage >= pagination.lastPage}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}

          {errors.general && <p className="mt-3 text-xs text-amber-600">{errors.general[0]}</p>}
        </section>
      </div>
    </ProtectedShell>
  );
}
