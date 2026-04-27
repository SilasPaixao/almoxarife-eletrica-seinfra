import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import Modal from '../../components/Modal.tsx';
import api from '../../services/api.ts';
import { Plus, Search, FileDown, Upload, X, Loader2, Calendar, MapPin, User, ClipboardList, Trash2, Package } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

export default function Demands() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDemand, setEditingDemand] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    location: '',
    description: '',
    clientNumber: '',
    electricianId: '',
    materials: [] as { materialId: string; quantity: number }[]
  });

  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialResults, setShowMaterialResults] = useState(false);

  const { data: demands, isLoading } = useQuery({
    queryKey: ['demands'],
    queryFn: async () => (await api.get('/demands')).data,
  });

  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await api.get('/materials')).data,
  });

  const filteredMaterials = materials?.filter((m: any) => 
    m.name.toLowerCase().includes(materialSearch.toLowerCase())
  );

  const { data: electricians } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const resp = await api.get('/users');
      return resp.data.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED');
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => await api.post('/demands', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => await api.put(`/demands/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      setIsModalOpen(false);
      resetForm();
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (name: string) => (await api.post('/materials', { name })).data,
    onSuccess: (newMaterial) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      handleAddMaterial(newMaterial.id);
      setMaterialSearch('');
      setShowMaterialResults(false);
    }
  });

  const resetForm = () => {
    setEditingDemand(null);
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      location: '',
      description: '',
      clientNumber: '',
      electricianId: '',
      materials: []
    });
  };

  const handleEditDemand = (demand: any) => {
    setEditingDemand(demand);
    setFormData({
      date: format(new Date(demand.date), 'yyyy-MM-dd'),
      location: demand.location,
      description: demand.description,
      clientNumber: demand.clientNumber || '',
      electricianId: demand.electricianId,
      materials: demand.plannedMaterials?.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: pm.quantity
      })) || []
    });
    setIsModalOpen(true);
  };

  const handleAddMaterial = (materialId: string) => {
    if (!materialId) return;
    if (formData.materials.find(m => m.materialId === materialId)) return;
    setFormData({
      ...formData,
      materials: [...formData.materials, { materialId, quantity: 1 }]
    });
  };

  const updateMaterialQty = (materialId: string, quantity: number) => {
    setFormData({
      ...formData,
      materials: formData.materials.map(m => m.materialId === materialId ? { ...m, quantity } : m)
    });
  };

  const removeMaterial = (materialId: string) => {
    setFormData({
      ...formData,
      materials: formData.materials.filter(m => m.materialId !== materialId)
    });
  };

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        
        const mappedDemands = data.map(item => {
          const electricianName = item['Eletricista'] || item['eletricista'] || item['ELECTRICISTA'];
          const electrician = users?.find((u: any) => 
            u.name.toLowerCase() === electricianName?.toString().toLowerCase() ||
            u.username.toLowerCase() === electricianName?.toString().toLowerCase()
          );

          return {
            date: item['Data'] || item['data'] || format(new Date(), 'yyyy-MM-dd'),
            location: item['Local'] || item['local'] || 'Não especificado',
            description: item['Descrição'] || item['descricao'] || 'Sem descrição',
            clientNumber: item['Número Cliente']?.toString() || item['numero_cliente']?.toString() || '',
            electricianId: electrician?.id || users?.find((u: any) => u.role === 'ELECTRICIAN')?.id
          };
        }).filter(d => d.electricianId);

        if (mappedDemands.length === 0) {
          alert('Nenhuma demanda válida encontrada para importação. Verifique se os eletricistas estão cadastrados.');
          return;
        }

        if (confirm(`Deseja importar ${mappedDemands.length} demandas?`)) {
          await api.post('/demands/bulk', { demands: mappedDemands });
          queryClient.invalidateQueries({ queryKey: ['demands'] });
          alert('Importação concluída com sucesso!');
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('Erro ao importar Excel. Verifique o formato do arquivo.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const filteredDemands = demands?.filter((d: any) => 
    d.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.electrician?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>
          <p className="text-gray-600">Gestão de ordens de serviço e tarefas.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <label className="flex-1 md:flex-none bg-white border border-gray-300 rounded-lg px-4 py-2 flex items-center cursor-pointer hover:bg-gray-50 transition-colors">
            <Upload className="h-5 w-5 mr-2 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Importar Excel</span>
            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
          </label>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5 mr-2" /> Nova Demanda
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center">
        <Search className="h-5 w-5 text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Buscar por local, descrição ou eletricista..."
          className="flex-1 outline-none text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">Carregando demandas...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Local</th>
                <th className="px-6 py-3">Responsável</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDemands?.map((demand: any) => (
                <tr key={demand.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {format(new Date(demand.date), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{demand.location}</div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">{demand.description}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {demand.electrician?.name}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={demand.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleEditDemand(demand)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm(); }}
        title={editingDemand ? "Editar Demanda" : "Nova Demanda"}
        maxWidth="max-w-2xl"
      >
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            if (editingDemand) {
              updateMutation.mutate({ id: editingDemand.id, data: formData });
            } else {
              createMutation.mutate(formData);
            }
          }} 
          className="p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  required
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Praça Matriz"
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              required
              rows={2}
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eletricista Responsável</label>
              <select
                required
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={formData.electricianId}
                onChange={(e) => setFormData({...formData, electricianId: e.target.value})}
              >
                <option value="">Selecione...</option>
                {electricians?.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contato do Solicitante</label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={formData.clientNumber}
                onChange={(e) => setFormData({...formData, clientNumber: e.target.value})}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
              <Package className="h-4 w-4 mr-2" /> Materiais Planejados
            </h3>
            
            <div className="relative">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Pesquisar material planejado..."
                    value={materialSearch}
                    onChange={(e) => {
                      setMaterialSearch(e.target.value);
                      setShowMaterialResults(true);
                    }}
                    onFocus={() => setShowMaterialResults(true)}
                  />
                </div>
              </div>

              {showMaterialResults && materialSearch && (
                <div className="absolute z-10 w-full -mt-3 mb-4 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredMaterials?.map((m: any) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                      onClick={() => {
                        handleAddMaterial(m.id);
                        setMaterialSearch('');
                        setShowMaterialResults(false);
                      }}
                    >
                      <span className="text-sm text-gray-700">{m.name}</span>
                      <Plus className="h-4 w-4 text-gray-400" />
                    </button>
                  ))}
                  
                  {!materials?.find((m: any) => m.name.toLowerCase() === materialSearch.toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full text-left p-3 hover:bg-blue-50 text-blue-600 flex items-center border-t border-blue-100"
                      onClick={() => createMaterialMutation.mutate(materialSearch)}
                      disabled={createMaterialMutation.isPending}
                    >
                      {createMaterialMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-wider">Novo Material</span>
                        <span className="text-sm">Registrar "{materialSearch}"</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {formData.materials.map((m) => {
                const material = materials?.find((mat: any) => mat.id === m.materialId);
                return (
                  <div key={m.materialId} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <span className="text-sm font-medium text-gray-700">{material?.name}</span>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="1"
                        className="w-16 p-1 border border-gray-300 rounded text-center text-sm"
                        value={m.quantity}
                        onChange={(e) => updateMaterialQty(m.materialId, parseInt(e.target.value))}
                      />
                      <button 
                        type="button"
                        onClick={() => removeMaterial(m.materialId)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {formData.materials.length === 0 && (
                <p className="text-center text-xs text-gray-500 py-4 italic">Nenhum material adicionado.</p>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
            <button
              type="button"
              onClick={() => { setIsModalOpen(false); resetForm(); }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                editingDemand ? 'Salvar Alterações' : 'Criar Demanda'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    PLANNED: { color: 'bg-yellow-100 text-yellow-800', label: 'Planejada' },
    IN_PROGRESS: { color: 'bg-blue-100 text-blue-800', label: 'Em Execução' },
    PENDING_APPROVAL: { color: 'bg-green-100 text-green-800', label: 'Aguardando Aprovação' },
    CONCLUDED: { color: 'bg-purple-100 text-purple-800', label: 'Executada' },
  };

  const config = configs[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
