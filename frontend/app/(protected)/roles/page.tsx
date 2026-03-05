"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import FormInput from "@/components/form/FormInput";
import FormLabel from "@/components/form/FormLabel";
import FormOptionCheckbox from "@/components/form/FormOptionCheckbox";
import FormSelect from "@/components/form/FormSelect";
import TableSkeleton from "@/components/skeleton/TableSkeleton";

interface Permission {
  id: number;
  name: string;
}

interface Role {
  id: number;
  name: string;
  permissions: Permission[];
}

interface PaginatedRolesResponse {
  data: Role[];
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

interface DeleteTarget {
  ids: number[];
  label: string;
  isBulk: boolean;
}

const DEFAULT_PER_PAGE = 10;

const normalizePage = (rawPage: string | null): number => {
  const page = Number(rawPage ?? "1");

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
};

export default function RolesManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const [filterSearch, setFilterSearch] = useState("");
  const [filterPermission, setFilterPermission] = useState("all");

  const [pagination, setPagination] = useState<PaginationMeta>({
    currentPage: 1,
    lastPage: 1,
    perPage: DEFAULT_PER_PAGE,
    total: 0,
    from: null,
    to: null,
  });

  const isEditMode = useMemo(() => editingId !== null, [editingId]);
  const selectedRoleIdsSet = useMemo(() => new Set(selectedRoleIds), [selectedRoleIds]);
  const allVisibleSelected = useMemo(
    () => roles.length > 0 && roles.every((role) => selectedRoleIdsSet.has(role.id)),
    [roles, selectedRoleIdsSet]
  );
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

  const loadPermissionOptions = useCallback(async () => {
    try {
      const response = await api.get<Permission[]>("/admin/permissions");
      setPermissions(response.data);
    } catch {
      setPermissions([]);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams(searchParamsString);
    const searchValue = (params.get("search") ?? "").trim();
    const permissionValue = params.get("permission") ?? "";
    const pageValue = normalizePage(params.get("page"));

    const requestParams: Record<string, string | number> = {
      page: pageValue,
      per_page: DEFAULT_PER_PAGE,
      paginate: 1,
    };

    if (searchValue !== "") {
      requestParams.search = searchValue;
    }

    if (permissionValue !== "" && permissionValue !== "all") {
      requestParams.permission = permissionValue;
    }

    try {
      const response = await api.get<PaginatedRolesResponse>("/admin/roles", {
        params: requestParams,
      });

      setRoles(response.data.data);
      const visibleIds = new Set(response.data.data.map((role) => role.id));
      setSelectedRoleIds((previous) => previous.filter((id) => visibleIds.has(id)));
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
      setRoles([]);
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
        general: [axiosError.response?.data?.message || "Failed to load roles"],
      }));
    } finally {
      setLoading(false);
    }
  }, [searchParamsString]);

  useEffect(() => {
    loadPermissionOptions();
  }, [loadPermissionOptions]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const urlSearch = params.get("search") ?? "";
    const urlPermission = params.get("permission") ?? "all";

    setFilterSearch(urlSearch);
    setFilterPermission(urlPermission || "all");
  }, [searchParamsString]);

  const resetForm = (closeForm = false) => {
    setEditingId(null);
    setName("");
    setSelectedPermissions([]);
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

  const togglePermission = (permissionName: string) => {
    setSelectedPermissions((previous) =>
      previous.includes(permissionName) ? previous.filter((value) => value !== permissionName) : [...previous, permissionName]
    );
  };

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();

    updateQueryParams({
      search: filterSearch.trim() || null,
      permission: filterPermission,
      page: 1,
    });
  };

  const handleFilterReset = () => {
    setFilterSearch("");
    setFilterPermission("all");

    updateQueryParams({
      search: null,
      permission: null,
      page: null,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitting(true);

    const payload = {
      name,
      permissions: selectedPermissions,
    };

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/roles/${editingId}`, payload);
      } else {
        await api.post("/admin/roles", payload);
      }

      resetForm(true);
      await loadRoles();
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to save role"] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (role: Role) => {
    setShowForm(true);
    setEditingId(role.id);
    setName(role.name);
    setSelectedPermissions(role.permissions.map((permission) => permission.name));
    setErrors({});
  };

  const openDeleteModal = (role: Role) => {
    setDeleteTarget({ ids: [role.id], label: `${role.name} (ID: ${role.id})`, isBulk: false });
  };

  const openBulkDeleteModal = () => {
    if (selectedRoleIds.length === 0) {
      return;
    }

    setDeleteTarget({
      ids: selectedRoleIds,
      label: `${selectedRoleIds.length} roles selected`,
      isBulk: true,
    });
  };

  const closeDeleteModal = () => {
    if (deleting) {
      return;
    }

    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);

    try {
      if (deleteTarget.isBulk) {
        await api.post("/admin/roles/bulk-delete", {
          ids: deleteTarget.ids,
        });
        setSelectedRoleIds([]);
      } else {
        await api.delete(`/admin/roles/${deleteTarget.ids[0]}`);
      }

      setDeleteTarget(null);
      await loadRoles();
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrors({ general: [axiosError.response?.data?.message || "Failed to delete role"] });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleRoleSelection = (roleId: number, checked: boolean) => {
    setSelectedRoleIds((previous) => {
      if (checked) {
        if (previous.includes(roleId)) {
          return previous;
        }

        return [...previous, roleId];
      }

      return previous.filter((id) => id !== roleId);
    });
  };

  const handleToggleSelectAllVisible = (checked: boolean) => {
    const visibleIds = roles.map((role) => role.id);

    setSelectedRoleIds((previous) => {
      if (checked) {
        return Array.from(new Set([...previous, ...visibleIds]));
      }

      const visibleSet = new Set(visibleIds);
      return previous.filter((id) => !visibleSet.has(id));
    });
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
    <ProtectedShell title="Roles Management" description="Create, Update, Delete roles">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Roles Management</h2>
              <p className="text-sm text-slate-500">Create, Update, Delete roles</p>
            </div>
            <Button type="button" onClick={toggleForm} variant="secondary" size="md">
              {showForm ? "Close" : "Create Role"}
            </Button>
          </div>
        </section>

        <div
          aria-hidden={!showForm}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${showForm ? "max-h-[1200px] opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"}`}
        >
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
            <h3 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update Role Form" : "Add Role Form"}</h3>

            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <FormInput
                id="role-name"
                label="Role Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="example: manager"
                error={errors.name?.[0]}
                containerClassName="md:col-span-2"
              />

              <div className="md:col-span-2">
                <FormLabel text="Permissions" />
                <div className="mt-1.5 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-300 bg-white px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-3">
                  {permissions.length === 0 && <p className="text-xs text-slate-500">No permissions found</p>}
                  {permissions.map((permission) => (
                    <FormOptionCheckbox
                      key={permission.id}
                      label={permission.name}
                      checked={selectedPermissions.includes(permission.name)}
                      onChange={() => togglePermission(permission.name)}
                    />
                  ))}
                </div>
                {errors.permissions?.[0] && <p className="mt-1 text-xs text-rose-600">{errors.permissions[0]}</p>}
              </div>

              {errors.general && <p className="text-xs text-amber-600 md:col-span-2">{errors.general[0]}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={submitting} loading={submitting} className="w-full sm:w-auto" size="lg">
                  {isEditMode ? "Update Role" : "Create Role"}
                </Button>
                <Button type="button" onClick={() => resetForm(true)} variant="outline" size="lg">
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Filter Roles</h2>
          <form onSubmit={handleFilterSubmit} className="mt-4 flex flex-wrap items-end gap-3">
            <FormInput
              id="filter-role-search"
              label="Search"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search by role name"
              containerClassName="w-full sm:min-w-[280px] sm:flex-[2]"
            />

            <FormSelect
              id="filter-role-permission"
              label="Permission"
              value={filterPermission}
              onChange={(event) => setFilterPermission(event.target.value)}
              options={[
                { label: "All permissions", value: "all" },
                ...permissions.map((permission) => ({ label: permission.name, value: permission.name })),
              ]}
              containerClassName="w-full sm:w-[260px] sm:flex-1"
            />

            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="submit" size="lg" className="w-full sm:w-auto whitespace-nowrap">
                Apply Filters
              </Button>
              <Button type="button" onClick={handleFilterReset} variant="outline" size="lg" className="w-full sm:w-auto whitespace-nowrap">
                Reset
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Roles Table</h2>
            {selectedRoleIds.length > 0 && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={openBulkDeleteModal}
              >
                Delete Selected ({selectedRoleIds.length})
              </Button>
            )}
          </div>

          {loading ? (
            <TableSkeleton columns={3} rows={6} />
          ) : (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-2 py-2 font-medium">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(event) => handleToggleSelectAllVisible(event.target.checked)}
                          aria-label="Select all visible roles"
                        />
                      </th>
                      <th className="px-2 py-2 font-medium">Role</th>
                      <th className="px-2 py-2 font-medium">Permissions</th>
                      <th className="px-2 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-sm text-slate-500">
                          No roles found for selected filters.
                        </td>
                      </tr>
                    )}

                    {roles.map((role) => (
                      <tr key={role.id} className="border-b border-slate-100 text-slate-700">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedRoleIdsSet.has(role.id)}
                            onChange={(event) => handleToggleRoleSelection(role.id, event.target.checked)}
                            aria-label={`Select role ${role.name}`}
                          />
                        </td>
                        <td className="px-2 py-2 font-medium">{role.name}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {role.permissions.length === 0 && <span className="text-xs text-slate-400">No permission</span>}
                            {role.permissions.map((permission) => (
                              <span key={permission.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                {permission.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <Button type="button" onClick={() => handleEdit(role)} variant="outline" size="sm">
                              Edit
                            </Button>
                            <Button type="button" onClick={() => openDeleteModal(role)} variant="danger" size="sm">
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <p>
                    Page {pagination.currentPage} of {pagination.lastPage || 1}
                  </p>
                  <span aria-hidden="true">|</span>
                  <p>
                    Showing {pagination.from ?? 0}-{pagination.to ?? 0} of {pagination.total}
                  </p>
                </div>

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
                    <Button key={page} type="button" onClick={() => goToPage(page)} variant={page === pagination.currentPage ? "primary" : "outline"} size="sm">
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
      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        title={deleteTarget?.isBulk ? "Delete selected roles" : "Delete role"}
        description={
          deleteTarget?.isBulk
            ? "Are you sure you want to delete selected roles? This action cannot be undone."
            : "Are you sure you want to delete this role? This action cannot be undone."
        }
        itemName={deleteTarget ? deleteTarget.label : undefined}
        confirmLabel={deleteTarget?.isBulk ? "Delete Roles" : "Delete Role"}
        loading={deleting}
        onCancel={closeDeleteModal}
        onConfirm={handleDelete}
      />
    </ProtectedShell>
  );
}
