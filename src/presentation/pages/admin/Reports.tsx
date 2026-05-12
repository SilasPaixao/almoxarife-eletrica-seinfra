import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import api from '../../services/api.ts';
import { FileText, Download, Calendar, Loader2, User, LayoutDashboard, List, BarChart3, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ReportRange = 'weekly' | 'monthly' | 'yearly';

export default function Reports() {
  const [range, setRange] = useState<ReportRange>('weekly');

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', range],
    queryFn: async () => (await api.get(`/reports/data?range=${range}`)).data,
  });

  const handleDownload = async (formatType: 'pdf' | 'docx') => {
    if (!report) return;
    try {
      const { start, end } = report.period;
      const response = await api.get(`/reports/download/${formatType}?start=${start}&end=${end}&range=${range}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_${range}_${start.replace(/\//g, '-')}.${formatType}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(`Erro ao baixar ${formatType}:`, error);
      alert('Erro ao gerar o arquivo. Verifique se você tem permissão.');
    }
  };

  const getRangeTitle = () => {
    switch (range) {
      case 'weekly': return 'Semanal';
      case 'monthly': return 'Mensal';
      case 'yearly': return 'Anual';
      default: return '';
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inteligência de Almoxarifado</h1>
          <p className="text-gray-600">Relatórios auditáveis e dashboards de performance.</p>
        </div>
        
        <div className="flex items-center bg-gray-100 p-1 rounded-xl">
          {(['weekly', 'monthly', 'yearly'] as ReportRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                range === r ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r === 'weekly' ? 'Semanal' : r === 'monthly' ? 'Mensal' : 'Anual'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold text-gray-500 uppercase">Demandas</span>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{Object.values(report?.data || {}).flat().length}</p>
          <p className="text-xs text-gray-400 mt-1">Concluídas no período {getRangeTitle().toLowerCase()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <User className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold text-gray-500 uppercase">Equipe Ativa</span>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{Object.keys(report?.data || {}).length}</p>
          <p className="text-xs text-gray-400 mt-1">Eletricistas em campo</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <Calendar className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold text-gray-500 uppercase">Período</span>
          </div>
          <p className="text-sm font-bold text-gray-900">{report?.period.start} — {report?.period.end}</p>
          <p className="text-xs text-gray-400 mt-1">Intervalo de auditoria</p>
        </div>

        <div className="bg-blue-600 p-6 rounded-2xl shadow-lg flex flex-col justify-between">
          <span className="text-xs font-bold text-blue-100 uppercase">Versão para Exportação</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownload('pdf')}
              disabled={!report}
              className="flex-1 bg-white text-blue-600 py-2 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              PDF
            </button>
            <button
              onClick={() => handleDownload('docx')}
              disabled={!report}
              className="flex-1 bg-blue-700 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              Word
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-500">Consolidando indicadores {getRangeTitle().toLowerCase()}s...</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <List className="h-5 w-5 text-gray-400" />
                Resumo por Eletricista
              </h3>
            </div>

            {Object.entries(report?.data || {}).map(([name, demands]: [string, any]) => (
              <div key={name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center">
                  <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold mr-4">
                    {name.charAt(0)}
                  </div>
                  <h4 className="font-bold text-gray-900">{name}</h4>
                  <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                    {demands.length} {demands.length === 1 ? 'Demanda' : 'Demandas'}
                  </span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {demands.map((d: any) => (
                      <div key={d.id} className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 bg-gray-50/30 transition-all space-y-3 group">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-blue-600">{format(new Date(d.date), 'dd/MM/yyyy')}</p>
                          <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded uppercase">FEITO</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900 line-clamp-2 min-h-[40px] group-hover:text-blue-700 transition-colors">{d.location}</p>
                        
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Materiais Impactados</p>
                          <div className="flex flex-wrap gap-1">
                            {d.usedMaterials.slice(0, 2).map((m: any) => (
                              <span key={m.id} className="text-[10px] bg-white border border-gray-100 px-2 py-1 rounded-lg text-gray-600">
                                {m.quantity}x {m.material.name}
                              </span>
                            ))}
                            {d.usedMaterials.length > 2 && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold">
                                +{d.usedMaterials.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {Object.keys(report?.data || {}).length === 0 && (
              <div className="bg-white py-20 rounded-2xl border border-dashed border-gray-200 text-center">
                <FileText className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-medium">Nenhum dado consolidado para este período.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
