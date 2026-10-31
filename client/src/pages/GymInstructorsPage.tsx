import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorState, LoadingState } from '../components/ui/states';
import { api } from '../lib/api';

interface InstructorRow { id: string; fullName: string; email: string; phone: string | null; specializations: string[]; assignedMembersCount: number; startDate: string; status: string; }
interface ListResult { data: InstructorRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }

export function GymInstructorsPage() {
  const [result, setResult] = useState<ListResult | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const query = new URLSearchParams({ page: String(page), pageSize: '10', search, status }); setResult(await api<ListResult>(`/instructors?${query}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load instructors'); }
    finally { setLoading(false); }
  }, [page, search, status]);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-primary">GYM ADMINISTRATION</p><h1 className="mt-1 text-2xl font-bold">Instructors</h1><p className="text-sm text-muted-foreground">{result?.meta.total ?? '—'} accounts in this gym</p></div><Link to="/gym/instructors/new"><Button className="px-4 py-2"><Plus className="h-4 w-4"/> Add instructor</Button></Link></header>
    <section className="surface-card overflow-hidden"><div className="flex flex-wrap gap-3 border-b border-border p-4"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input className="input pl-9" aria-label="Search instructors" placeholder="Name or email" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div><select className="input w-auto" aria-label="Instructor status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="all">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option></select><Button variant="outline" className="px-3 py-2" onClick={()=>void load()}>Refresh</Button></div>
    {loading?<LoadingState label="Loading instructors…"/>:error?<div className="p-4"><ErrorState title="Could not load instructors" message={error} onRetry={load}/></div>:!result?.data.length?<p className="p-12 text-center text-sm text-muted-foreground">No instructors match these filters.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">{['Name','Email','Phone','Specialties','Assigned members','Joined','Status',''].map(x=><th className="px-4 py-3 font-medium" key={x}>{x}</th>)}</tr></thead><tbody>{result.data.map(row=><tr key={row.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium"><Link className="hover:text-primary" to={`/gym/instructors/${row.id}`}>{row.fullName}</Link></td><td className="px-4 py-3">{row.email}</td><td className="px-4 py-3">{row.phone||'—'}</td><td className="px-4 py-3">{row.specializations.join(', ')||'—'}</td><td className="px-4 py-3">{row.assignedMembersCount}</td><td className="px-4 py-3">{new Date(row.startDate).toLocaleDateString()}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3"><Link className="text-primary" to={`/gym/instructors/${row.id}`}>Open</Link></td></tr>)}</tbody></table></div>}
    {result&&<div className="flex items-center justify-between border-t border-border p-3 text-sm"><span>Page {result.meta.page} of {Math.max(1,result.meta.totalPages)} · {result.meta.total} total</span><div className="flex gap-2"><Button variant="outline" className="px-3 py-1" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button variant="outline" className="px-3 py-1" disabled={page>=result.meta.totalPages} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>}</section>
  </div>;
}
