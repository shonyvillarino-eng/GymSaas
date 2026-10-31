import { memo } from 'react';
import { FileText } from 'lucide-react';

export const GymAttendanceReportPage = memo(function GymAttendanceReportPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Reporte de asistencias</h1>
        <p className="text-sm text-slate-500">Disponible desde el dashboard y reportes.</p>
      </header>
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <FileText className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-2 text-sm text-slate-500">Reporte de asistencias disponible en /gym/reports</p>
      </div>
    </div>
  );
});
