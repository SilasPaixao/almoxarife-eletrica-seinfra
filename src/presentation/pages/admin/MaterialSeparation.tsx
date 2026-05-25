import React, { useState } from 'react';
import Layout from '../../components/Layout.tsx';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  Layers, 
  Search, 
  Calendar, 
  User, 
  MapPin, 
  Package, 
  FileDown, 
  ClipboardList,
  CheckSquare,
  Square,
  ArrowLeft,
  Info
} from 'lucide-react';
import { formatLocalDate } from '../../utils/date.ts';

interface ElectricianListItem {
  id: string;
  name: string;
  username: string;
  pendingDemandsCount: number;
}

interface MaterialTotal {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface SeparationDetailResponse {
  electrician: {
    id: string;
    name: string;
    username: string;
  };
  demands: Array<{
    id: string;
    date: string | Date;
    description: string;
    location: string;
    plannedMaterials: Array<{
      id: string;
      material: {
        id: string;
        name: string;
        unit: string;
      };
      quantity: number;
    }>;
  }>;
  totals: Array<MaterialTotal>;
}

export default function MaterialSeparation() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // State
  const [selectedElectricianId, setSelectedElectricianId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Query: if admin, get the list of active electricians with pending demands
  const { data: electriciansData, isLoading: isLoadingList } = useQuery({
    queryKey: ['separation-electricians'],
    queryFn: () => api.get('/demands/separation/data').then(res => res.data),
    enabled: isAdmin && !selectedElectricianId
  });

  // Query: get separation details for a specific electrician
  // (if electrician, queries their own automatically; if admin, queries the selected one)
  const targetId = isAdmin ? selectedElectricianId : user?.id;
  const { data: detailData, isLoading: isLoadingDetail } = useQuery<SeparationDetailResponse>({
    queryKey: ['separation-details', targetId],
    queryFn: () => api.get(`/demands/separation/data?electricianId=${targetId}`).then(res => res.data),
    enabled: !!targetId
  });

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDownloadPdf = (electricianId: string, name: string) => {
    // Navigate or trigger download of the compiled separation PDFKit file
    const token = localStorage.getItem('token');
    const url = `${api.defaults.baseURL || ''}/demands/separation/pdf/${electricianId}?token=${token}`;
    window.open(url, '_blank');
  };

  // Filter electricians based on search
  const filteredElectricians = electriciansData?.electricians?.filter((ele: ElectricianListItem) => 
    ele.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ele.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Layers className="h-7 w-7 text-blue-600" />
            Kits de Separação - Almoxarifado
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Geração de folhas de carga e checklist agrupado de materiais planejados para facilitar a separação física do estoque.
          </p>
        </div>

        {targetId && (
          <button
            onClick={() => handleDownloadPdf(detailData?.electrician?.id || targetId || '', detailData?.electrician?.name || '')}
            disabled={isLoadingDetail || !detailData?.demands?.length}
            className="p-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Baixar PDF de Separação
          </button>
        )}
      </div>

      {/* ADMIN view: list of electricians with pending demands */}
      {isAdmin && !selectedElectricianId ? (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Como funciona a separação consolidada?</p>
              <p className="text-gray-600 text-xs mt-0.5">
                Selecione um eletricista abaixo para compilar todos os materiais planejados de suas demandas pendentes de execução. O sistema soma as quantidades de cada item para gerar uma folha de separação consolidada, facilitando o trabalho do almoxarife de uma só vez.
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar eletricista pelo nome ou usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Electricians List Grid */}
          {isLoadingList ? (
            <div className="p-12 text-center text-gray-500">Carregando lista de profissionais...</div>
          ) : filteredElectricians?.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
              <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold">Nenhum profissional com pendências.</p>
              <p className="text-gray-400 text-xs mt-1">Nenhum eletricista aprovado tem demandas atualmente marcadas como "Pendente" no sistema.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredElectricians?.map((ele: ElectricianListItem) => (
                <div key={ele.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                        <User className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 leading-tight block">{ele.name}</h3>
                        <span className="text-xs text-gray-500 block font-mono">@{ele.username}</span>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg text-xs font-bold text-amber-800 mb-6">
                      <ClipboardList className="h-3.5 w-3.5" />
                      {ele.pendingDemandsCount} {ele.pendingDemandsCount === 1 ? 'demanda pendente' : 'demandas pendentes'}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedElectricianId(ele.id)}
                      className="flex-1 text-center py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-lg transition-colors border border-gray-200"
                    >
                      Ver Detalhes
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(ele.id, ele.name)}
                      className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                      title="Baixar PDF de Separação"
                    >
                      <FileDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* DETAIL VIEW (Specific Electrician or Logged-in Electrician) */
        <div className="space-y-8">
          {/* Back Action for Admin */}
          {isAdmin && (
            <button
              onClick={() => {
                setSelectedElectricianId(null);
                setCheckedItems({});
              }}
              className="inline-flex items-center gap-1.5 p-1.5 px-3 bg-white hover:bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 rounded-lg shadow-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para Lista de Profissionais
            </button>
          )}

          {isLoadingDetail ? (
            <div className="p-12 text-center text-gray-500">Preparando kit de separação...</div>
          ) : !detailData?.demands?.length ? (
            <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
              <Layers className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold">Nenhum material planejado pendente.</p>
              <p className="text-gray-400 text-xs mt-1">Este profissional não tem ordens pendentes com materiais planejados cadastrados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left columns: Detail of individual demands */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block"></span>
                  <h2 className="text-lg font-black text-gray-900">1. Materiais Separados por Demanda</h2>
                </div>

                {detailData.demands.map((demand) => (
                  <div key={demand.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Demand Header Banner */}
                    <div className="bg-blue-50/75 border-b border-blue-100 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm leading-tight uppercase">{demand.location}</h4>
                          <span className="text-xs text-gray-500">{demand.description}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatLocalDate(demand.date, 'dd/MM/yyyy')}
                        </span>
                      </div>
                    </div>

                    {/* Planned Materials Checklist */}
                    <div className="p-4">
                      {demand.plannedMaterials?.length === 0 ? (
                        <p className="text-gray-400 text-xs italic p-2">Nenhum material planejado nesta demanda.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {demand.plannedMaterials.map((pm) => (
                            <div key={pm.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                              <span className="font-bold text-gray-800">{pm.material?.name}</span>
                              <div className="flex items-center gap-4 shrink-0">
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase font-mono">{pm.material?.unit}</span>
                                <span className="text-sm font-black text-gray-900 border border-gray-200 px-2.5 py-0.5 bg-gray-50 rounded min-w-[36px] text-center">
                                  {pm.quantity}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right column: Consolidated picker summary checklist */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 block"></span>
                  <h2 className="text-lg font-black text-gray-900">2. Checklist Geral de Separação</h2>
                </div>

                <div className="bg-neutral-900 text-white rounded-xl shadow-md p-6 border border-neutral-800">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
                    <div>
                      <h3 className="font-bold text-sm tracking-wide text-neutral-400 uppercase">Resumo Almoxarifado</h3>
                      <p className="text-xs text-neutral-500 leading-tight">Separação de carga ({detailData.electrician.name})</p>
                    </div>
                    <Layers className="h-5 w-5 text-emerald-500" />
                  </div>

                  <p className="text-neutral-400 text-xs leading-relaxed mb-6">
                    Clique nas caixas abaixo para marcar e check-off físico dos materiais retirados das prateleiras do armazém.
                  </p>

                  <div className="space-y-3.5 mb-6">
                    {detailData.totals?.length === 0 ? (
                      <p className="text-neutral-500 text-center text-xs italic py-4">Nenhum material pendente para consolidar.</p>
                    ) : (
                      detailData.totals.map((item) => {
                        const isChecked = !!checkedItems[item.id];
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            className={`flex items-start justify-between p-3 rounded-lg border cursor-pointer select-none transition-all ${
                              isChecked 
                                ? 'bg-emerald-950/40 border-emerald-900 text-emerald-300' 
                                : 'bg-neutral-800/40 border-neutral-800 hover:bg-neutral-800 text-white hover:border-neutral-700'
                            }`}
                          >
                            <div className="flex gap-2.5">
                              <div className="mt-0.5 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Square className="h-4.5 w-4.5 text-neutral-500 shrink-0" />
                                )}
                              </div>
                              <div>
                                <span className={`text-xs block font-bold leading-tight ${isChecked ? 'line-through text-emerald-500/85' : ''}`}>
                                  {item.name}
                                </span>
                                <span className="text-[10px] text-neutral-500 uppercase font-mono leading-none mt-0.5 block">Unidade: {item.unit}</span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right pl-2">
                              <span className={`text-sm font-black tracking-tight ${isChecked ? 'text-emerald-400' : 'text-blue-400'}`}>
                                {item.quantity}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {detailData.totals?.length > 0 && (
                    <div className="bg-neutral-800/50 rounded-lg p-3 text-[11px] text-neutral-400 leading-relaxed border border-neutral-800">
                      <span className="font-bold text-neutral-300 block mb-0.5 uppercase tracking-wide">Dica do Almoxarife:</span>
                      Imprima ou visualize esta lista no smartphone enquanto caminha pelas gôndolas para acelerar o processo.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
