import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ImagePlus, Save, X } from 'lucide-react';
import { DOCUMENT_TYPES, MEMBER_STATUSES } from '@gym-saas/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ErrorState, LoadingState, SuccessState } from '../components/ui/states';
import { api, apiErrorMessage } from '../lib/api';
import { formatDocument, statusLabel, type MemberDetail } from '../lib/members';

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;

const memberFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter at least 2 characters').max(120, 'Must be at most 120 characters'),
  documentType: z.enum(DOCUMENT_TYPES, { error: 'Choose a document type' }),
  documentNumber: z
    .string()
    .trim()
    .min(4, 'Document must be at least 4 characters')
    .max(20, 'Document must be at most 20 characters')
    .regex(/^[A-Za-z0-9-]+$/, 'Only letters, numbers and hyphens'),
  birthDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')]),
  gender: z.union([z.literal(''), z.enum(GENDERS)]),
  phone: z.string().trim().min(4, 'Enter a valid phone number').max(40, 'Must be at most 40 characters'),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  address: z.string().max(240, 'Must be at most 240 characters'),
  emergencyName: z.string().max(120, 'Must be at most 120 characters'),
  emergencyPhone: z.string().max(40, 'Must be at most 40 characters'),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the join date'),
  notes: z.string().max(1000, 'Must be at most 1000 characters'),
  status: z.enum(MEMBER_STATUSES),
});
type MemberFormValues = z.infer<typeof memberFormSchema>;

const emptyValues: MemberFormValues = {
  fullName: '',
  documentType: 'DNI',
  documentNumber: '',
  birthDate: '',
  gender: '',
  phone: '',
  email: '',
  address: '',
  emergencyName: '',
  emergencyPhone: '',
  joinDate: new Date().toISOString().slice(0, 10),
  notes: '',
  status: 'ACTIVE',
};

function toPayload(values: MemberFormValues, includeStatus: boolean) {
  const payload: Record<string, unknown> = {
    fullName: values.fullName,
    documentType: values.documentType,
    documentNumber: values.documentNumber,
    birthDate: values.birthDate || null,
    gender: values.gender || null,
    phone: values.phone,
    email: values.email || null,
    address: values.address || null,
    emergencyName: values.emergencyName || null,
    emergencyPhone: values.emergencyPhone || null,
    joinDate: values.joinDate,
    notes: values.notes || null,
  };
  if (includeStatus) payload.status = values.status;
  return payload;
}

export function GymMemberFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberFormSchema), defaultValues: emptyValues });

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    api<{ data: MemberDetail }>(`/members/${id}`)
      .then((result) => {
        if (!active) return;
        setMember(result.data);
        reset({
          fullName: result.data.fullName,
          documentType: (result.data.documentType ?? 'DNI') as MemberFormValues['documentType'],
          documentNumber: result.data.documentNumber ?? '',
          birthDate: result.data.birthDate ? result.data.birthDate.slice(0, 10) : '',
          gender: (result.data.gender ?? '') as MemberFormValues['gender'],
          phone: result.data.phone ?? '',
          email: result.data.email ?? '',
          address: result.data.address ?? '',
          emergencyName: result.data.emergencyName ?? '',
          emergencyPhone: result.data.emergencyPhone ?? '',
          joinDate: result.data.joinDate.slice(0, 10),
          notes: result.data.notes ?? '',
          status: result.data.status,
        });
      })
      .catch((cause) => active && setLoadError(apiErrorMessage(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, reset]);

  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const submit = handleSubmit(async (values) => {
    setSaving(true);
    setFormError('');
    setSuccess('');
    try {
      if (!id) {
        const created = await api<{ data: MemberDetail }>('/members', {
          method: 'POST',
          body: JSON.stringify(toPayload(values, true)),
        });
        if (photoFile) {
          const body = new FormData();
          body.append('photo', photoFile);
          try {
            await fetch(`/api/v1/members/${created.data.id}/photo`, { method: 'POST', credentials: 'include', body });
            navigate(`/gym/members/${created.data.id}`, { replace: true });
          } catch (cause) {
            navigate(`/gym/members/${created.data.id}`, {
              replace: true,
              state: { notice: `Member created, but the photo could not be uploaded: ${apiErrorMessage(cause)}` },
            });
          }
        } else {
          navigate(`/gym/members/${created.data.id}`, { replace: true });
        }
        return;
      }
      await api(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(toPayload(values, false)) });
      setSuccess('Member updated.');
      setMember((current) => (current ? { ...current, ...values } as MemberDetail : current));
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  });

  const uploadPhoto = async () => {
    if (!photoFile || !id) return;
    setUploadingPhoto(true);
    setFormError('');
    setSuccess('');
    try {
      const body = new FormData();
      body.append('photo', photoFile);
      const result = await fetch(`/api/v1/members/${id}/photo`, { method: 'POST', credentials: 'include', body });
      const payload = (await result.json()) as { data?: MemberDetail; error?: string; details?: Record<string, string[]> };
      if (!result.ok) {
        const details = Object.values(payload.details ?? {}).flat().join(' ');
        throw new Error(details ? `${payload.error ?? 'Could not upload photo'}: ${details}` : payload.error ?? 'Could not upload photo');
      }
      setMember(payload.data ?? member);
      setPhotoFile(null);
      setPhotoPreview('');
      setSuccess('Photograph uploaded.');
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) return <LoadingState label="Loading member…" />;
  if (loadError) return <ErrorState title="Member unavailable" message={loadError} />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to={id ? `/gym/members/${id}` : '/gym/members'} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Back to member' : 'All members'}
      </Link>

      <header>
        <p className="text-sm font-medium text-primary">GYM ADMINISTRATION</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{id ? 'Edit member' : 'Register member'}</h1>
        <p className="text-sm text-muted-foreground">
          {id
            ? `Editing ${member ? formatDocument(member) : ''}. Changes are recorded in the audit log.`
            : 'Document identity must be unique inside this gym. Email is optional.'}
        </p>
      </header>

      {isEdit && member && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Administrative status:{' '}
          <span className="font-medium">{statusLabel(member.status)}</span> — change it from the member's page so the change is audited with its reason.
        </p>
      )}

      <form onSubmit={submit} className="space-y-5">
        <section className="surface-card p-5 sm:p-6">
          <h2 className="font-semibold">Personal information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Full name" required {...register('fullName')} error={errors.fullName?.message} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Document type</span>
                <select className="input" {...register('documentType')}>
                  {DOCUMENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                {errors.documentType && <p className="mt-1 text-xs text-destructive">{errors.documentType.message}</p>}
              </label>
              <Input label="Document number" required placeholder="12345678" {...register('documentNumber')} error={errors.documentNumber?.message} />
            </div>
            <Input label="Birth date" type="date" {...register('birthDate')} error={errors.birthDate?.message} />
            <label className="block">
              <span className="label">Gender (optional)</span>
              <select className="input" {...register('gender')}>
                <option value="">Not specified</option>
                {GENDERS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'PREFER_NOT_TO_SAY' ? 'Prefer not to say' : value.charAt(0) + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              {errors.gender && <p className="mt-1 text-xs text-destructive">{errors.gender.message}</p>}
            </label>
            <Input label="Phone" type="tel" required {...register('phone')} error={errors.phone?.message} />
            <Input label="Email (optional)" type="email" {...register('email')} error={errors.email?.message} />
            <Input label="Address" {...register('address')} error={errors.address?.message} />
            <Input label="Join date" type="date" required {...register('joinDate')} error={errors.joinDate?.message} />
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6">
          <h2 className="font-semibold">Emergency contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Contact name" required {...register('emergencyName')} error={errors.emergencyName?.message} />
            <Input label="Contact phone" type="tel" required {...register('emergencyPhone')} error={errors.emergencyPhone?.message} />
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6">
          <h2 className="font-semibold">Administrative details</h2>
          {!isEdit && (
            <label className="mt-4 block">
              <span className="label">Status on registration</span>
              <select className="input" {...register('status')}>
                {MEMBER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
              {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status.message}</p>}
            </label>
          )}
          <label className="mt-4 block">
            <span className="label">Administrative notes (optional)</span>
            <textarea className="input min-h-24" maxLength={1000} {...register('notes')} />
            {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes.message}</p>}
          </label>
        </section>

        {!isEdit && (
          <section className="surface-card p-5 sm:p-6">
            <h2 className="font-semibold">Photograph (optional)</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              PNG, JPEG or WebP, up to 2 MB. Stored in the project's object storage, never in PostgreSQL.
            </p>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
                {photoPreview ? (
                  <img src={photoPreview} alt="Photo preview" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Choose member photograph"
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setFormError('Photo must be no larger than 2 MB.');
                      return;
                    }
                    setFormError('');
                    setPhotoFile(file);
                    setPhotoPreview(URL.createObjectURL(file));
                  }}
                />
                {photoFile && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoPreview('');
                    }}
                    className="px-3 py-1.5"
                  >
                    <X className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}

        {isEdit && (
          <section className="surface-card p-5 sm:p-6">
            <h2 className="font-semibold">Photograph</h2>
            <p className="mb-4 text-sm text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Stored in object storage.</p>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
                {photoPreview || member?.photoUrl ? (
                  <img src={photoPreview || member?.photoUrl || ''} alt="Member photograph" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Choose member photograph"
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setFormError('Photo must be no larger than 2 MB.');
                      return;
                    }
                    setFormError('');
                    setPhotoFile(file);
                    setPhotoPreview(URL.createObjectURL(file));
                  }}
                />
                {photoFile && (
                  <Button type="button" loading={uploadingPhoto} onClick={() => void uploadPhoto()} className="px-3 py-1.5">
                    Upload photo
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}

        {formError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {formError}
          </p>
        )}
        {success && <SuccessState message={success} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(id ? `/gym/members/${id}` : '/gym/members')} className="px-4 py-2">
            Cancel
          </Button>
          <Button type="submit" loading={saving} className="px-4 py-2">
            <Save className="h-4 w-4" /> {id ? 'Save changes' : 'Register member'}
          </Button>
        </div>
      </form>
    </div>
  );
}
