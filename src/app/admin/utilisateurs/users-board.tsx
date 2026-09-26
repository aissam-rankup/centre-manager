"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, CircleCheckBig, Copy, KeyRound, Pencil, Power, PowerOff, UserPlus, Users } from "lucide-react";
import { type ReactElement, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { AssignmentPicker } from "@/components/admin/assignment-picker";
import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { StaffPhotoDialog } from "@/components/shared/staff-photo-dialog";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { createUser, setUserActive, updateUser } from "@/lib/actions/admin";
import { removeUserPhoto, setUserPhoto } from "@/lib/actions/profile";
import { LABELS } from "@/lib/constants/labels";
import type { AdminUser } from "@/lib/data/admin";
import type { LevelWithSubjects } from "@/lib/data/assistant";
import { formatDateTime } from "@/lib/format";
import { generatePassword } from "@/lib/password";
import { cn } from "@/lib/utils";
import { type UserCreateInput, userCreateSchema, userUpdateSchema } from "@/lib/validation/admin";

const L = LABELS.admin.users;
const ROLES = ["admin", "assistant", "teacher"] as const;

type UsersBoardProps = { users: AdminUser[]; levels: LevelWithSubjects[] };

export function UsersBoard({ users, levels }: UsersBoardProps) {
  const columns: DataTableColumn<AdminUser>[] = [
    {
      id: "name",
      header: L.name,
      mobile: "title",
      cell: (user) => (
        <span className="flex items-center gap-3">
          <StudentAvatar name={user.fullName} photoUrl={user.photoUrl} />
          <span className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {user.fullName}
              {user.isSelf ? (
                <span className="rounded-full bg-brand/10 px-2 text-caption font-medium text-brand-ink">{L.you}</span>
              ) : null}
            </span>
            <span className="text-caption text-muted-foreground md:hidden">{LABELS.roles[user.role]}</span>
          </span>
        </span>
      ),
    },
    { id: "role", header: L.role, mobile: "hidden", cell: (user) => LABELS.roles[user.role] },
    { id: "email", header: L.email, mobile: "wide", cell: (user) => <span className="break-all">{user.email}</span> },
    {
      id: "lastSignIn",
      header: L.lastSignIn,
      cell: (user) => (
        <span className="numeric font-normal">{user.lastSignInAt ? formatDateTime(user.lastSignInAt) : L.never}</span>
      ),
    },
    { id: "status", header: L.status, mobile: "aside", cell: (user) => <ActiveBadge active={user.active} /> },
    {
      id: "actions",
      header: LABELS.admin.common.actions,
      cell: (user) => (
        <div className="flex gap-1">
          <EditUserDialog
            user={user}
            levels={levels}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`${L.editUser} — ${user.fullName}`}>
                <Pencil aria-hidden />
              </Button>
            }
          />
          <StaffPhotoDialog
            title={LABELS.auth.photo.adminTitle(user.fullName)}
            description={LABELS.auth.photo.adminDescription}
            name={user.fullName}
            currentUrl={user.photoUrl}
            onSave={(data) => setUserPhoto(user.id, data)}
            onRemove={() => removeUserPhoto(user.id)}
            trigger={
              <Button variant="ghost" size="icon" aria-label={LABELS.auth.photo.change(user.fullName)}>
                <Camera aria-hidden />
              </Button>
            }
          />
          {user.isSelf ? null : <ToggleActiveButton user={user} />}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.title}
        description={L.description}
        actions={
          <NewUserDialog
            levels={levels}
            trigger={
              <Button>
                <UserPlus aria-hidden />
                {L.newUser}
              </Button>
            }
          />
        }
      />
      {users.length === 0 ? (
        <EmptyState icon={Users} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={users} getRowId={(user) => user.id} caption={L.caption} />
      )}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap",
        active ? "bg-success/10 text-success-ink" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-muted-foreground")} aria-hidden />
      {active ? L.active : L.inactive}
    </span>
  );
}

function ToggleActiveButton({ user }: { user: AdminUser }) {
  if (!user.active) {
    return (
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="icon" aria-label={`${L.reactivate} — ${user.fullName}`}>
            <Power aria-hidden />
          </Button>
        }
        title={L.reactivate}
        description={user.fullName}
        confirmLabel={L.reactivate}
        successMessage={L.reactivated}
        variant="default"
        action={() => setUserActive(user.id, true)}
      />
    );
  }
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon" aria-label={`${L.deactivate} — ${user.fullName}`}>
          <PowerOff aria-hidden />
        </Button>
      }
      title={L.deactivateConfirm(user.fullName)}
      description={L.deactivateHint}
      confirmLabel={L.deactivate}
      successMessage={L.deactivated}
      action={() => setUserActive(user.id, false)}
    />
  );
}

// ---------------------------------------------------------------------
// Modification
// ---------------------------------------------------------------------
function EditUserDialog({ user, levels, trigger }: { user: AdminUser; levels: LevelWithSubjects[]; trigger: ReactElement }) {
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: userUpdateSchema,
    defaultValues: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone ?? "",
      role: user.role,
      subjectIds: user.subjectIds,
    },
    action: updateUser,
    successMessage: LABELS.admin.common.saved,
  });
  const errors = form.formState.errors;
  const roleLocked = user.role === "teacher" || user.isSelf;

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} trigger={trigger} title={L.editUser} description={user.email} pending={pending} error={error} onSubmit={onSubmit}>
      <FormField id={`nom-${user.id}`} label={L.name} error={errors.fullName?.message}>
        <Input {...form.register("fullName")} />
      </FormField>
      <FormField id={`tel-${user.id}`} label={L.phone} error={errors.phone?.message}>
        <Input type="tel" inputMode="tel" {...form.register("phone")} />
      </FormField>
      <FormField id={`role-${user.id}`} label={L.role} hint={user.role === "teacher" ? L.roleLocked : undefined}>
        <NativeSelect disabled={roleLocked} {...form.register("role")}>
          {ROLES.filter((role) => (user.role === "teacher" ? role === "teacher" : role !== "teacher")).map((role) => (
            <option key={role} value={role}>
              {LABELS.roles[role]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {user.role === "teacher" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{L.assignments}</legend>
          <p className="mb-2 text-caption text-muted-foreground">{L.assignmentsHint}</p>
          <Controller
            control={form.control}
            name="subjectIds"
            render={({ field }) => <AssignmentPicker levels={levels} value={field.value} onChange={field.onChange} />}
          />
        </fieldset>
      ) : null}
    </FormDialog>
  );
}

// ---------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------
const EMPTY: UserCreateInput = { fullName: "", role: "assistant", phone: "", email: "", password: "", subjectIds: [] };

function NewUserDialog({ levels, trigger }: { levels: LevelWithSubjects[]; trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<UserCreateInput>({ resolver: zodResolver(userCreateSchema), defaultValues: EMPTY });
  const errors = form.formState.errors;
  const role = useWatch({ control: form.control, name: "role" });

  const onOpenChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      form.reset(EMPTY);
      setError(null);
      setCreated(null);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await createUser(values);
      if (!result.ok) {
        setError(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          if (field in EMPTY) form.setError(field as keyof UserCreateInput, { message });
        }
        return;
      }
      setCreated({ email: result.data.email, password: values.password });
    });
  });

  if (created) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-section">
              <CircleCheckBig className="size-6 text-success-ink" aria-hidden />
              {L.createdTitle}
            </DialogTitle>
            <DialogDescription>{L.createdDescription}</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 rounded-[10px] bg-muted px-4 py-3">
            <div>
              <dt className="text-caption text-muted-foreground">{L.email}</dt>
              <dd className="font-medium break-all">{created.email}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">{L.password}</dt>
              <dd className="numeric">{created.password}</dd>
            </div>
          </dl>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  LABELS.assistant.newTeacher.success.credentials(created.email, created.password),
                );
                toast.success(L.copied);
              } catch {
                toast.error(LABELS.actions.errors.unexpected);
              }
            }}
          >
            <Copy aria-hidden />
            {L.copy}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} trigger={trigger} title={L.newUser} pending={pending} error={error} submitLabel={LABELS.admin.common.create} onSubmit={onSubmit}>
      <FormField id="nouveau-nom" label={L.name} error={errors.fullName?.message}>
        <Input autoComplete="off" {...form.register("fullName")} />
      </FormField>
      <FormField id="nouveau-role" label={L.role}>
        <NativeSelect {...form.register("role")}>
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {LABELS.roles[item]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="nouveau-tel" label={L.phone} error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...form.register("phone")} />
        </FormField>
        <FormField id="nouveau-email" label={L.email} error={errors.email?.message}>
          <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...form.register("email")} />
        </FormField>
      </div>
      <div className="flex items-end gap-2">
        <FormField id="nouveau-mdp" label={L.password} hint={L.passwordHint} error={errors.password?.message} className="flex-1">
          <Input type="text" autoComplete="new-password" className="numeric font-normal" {...form.register("password")} />
        </FormField>
        <Button
          type="button"
          variant="outline"
          className="mb-7"
          onClick={() => form.setValue("password", generatePassword(), { shouldValidate: true })}
        >
          <KeyRound aria-hidden />
          {L.generate}
        </Button>
      </div>
      {role === "teacher" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{L.assignments}</legend>
          <p className="mb-2 text-caption text-muted-foreground">{L.assignmentsHint}</p>
          <Controller
            control={form.control}
            name="subjectIds"
            render={({ field }) => <AssignmentPicker levels={levels} value={field.value} onChange={field.onChange} />}
          />
          {errors.subjectIds ? <p className="text-caption text-danger-ink">{errors.subjectIds.message}</p> : null}
        </fieldset>
      ) : null}
    </FormDialog>
  );
}
