import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import api from '../../services/api.ts';
import { FileText, Download, Calendar, Loader2, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Reports() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['weekly-report'],
    queryFn: async () => (await api.get('/reports/weekly')).data,
  });

  const handleDownloadPdf = () => {
    if (!report) return;
    const { start, end } = report.period;
    window.open(`/api/reports/download/pdf?start=${start}&end=${end}`, '_blank');
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-gray-600">Relatórios semanais auditáveis do almoxarifado.</p>
        </div>
        <button
          onClick={handleDownloadPdf}
          disabled={!report}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Download className="h-5 w-5 mr-2" /> Baixar PDF
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-500">Compilando dados da semana...</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-blue-600 text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-2 opacity-80">Semana Atual</h2>
              <p className="text-3xl font-extrabold">{report?.period.start} — {report?.period.end}</p>
              <div className="mt-6 flex gap-4">
                <div className="bg-white bg-opacity-20 px-4 py-2 rounded-lg backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase opacity-70">Total de Demandas</p>
                  <p className="text-xl font-bold">{Object.values(report?.data || {}).flat().length}</p>
                </div>
                <div className="bg-white bg-opacity-20 px-4 py-2 rounded-lg backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase opacity-70">Eletricistas Ativos</p>
                  <p className="text-xl font-bold">{Object.keys(report?.data || {}).length}</p>
                </div>
              </div>
            </div>
            <FileText className="absolute right-[-20px] bottom-[-20px] h-64 w-64 text-white opacity-10" />
          </div>

          <div className="grid grid-cols-1 gap-6">
            <h3 className="text-xl font-bold text-gray-900">Resumo por Eletricista</h3>
            {Object.entries(report?.data || {}).map(([name, demands]: [string, any]) => (
              <div key={name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center">
                  <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold mr-4">
                    {name.charAt(0)}
                  </div>
                  <h4 className="font-bold text-gray-900">{name}</h4>
                  <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                    {demands.length} Demandas
                  </span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {demands.map((d: any) => (
                      <div key={d.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50 space-y-3">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-blue-600">{format(new Date(d.date), 'dd/MM/yyyy')}</p>
                          <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded uppercase">FEITO</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900 truncate">{d.location}</p>
                        
                        <div className="pt-2 border-t border-gray-200">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Materiais Utilizados</p>
                          <div className="flex flex-wrap gap-1">
                            {d.usedMaterials.slice(0, 3).map((m: any) => (
                              <span key={m.id} className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded">
                                {m.quantity}x {m.material.name}
                              </span>
                            ))}
                            {d.usedMaterials.length > 3 && <span className="text-[10px] text-gray-400">+{d.usedMaterials.length - 3}...</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
