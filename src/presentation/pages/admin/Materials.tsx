import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout.tsx';
import Modal from '../../components/Modal.tsx';
import ConfirmDialog from '../../components/ConfirmDialog.tsx';
import api from '../../services/api.ts';
import { Plus, Edit, Trash2, Camera, X, Loader2, Save, Package } from 'lucide-react';

export default function Materials() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', unit: 'un' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    materialId: ''
  });
  const [isGrouped, setIsGrouped] = useState(false);
  const [compositeComponents, setCompositeComponents] = useState<Array<{ materialId: string, quantity: number }>>([]);

  const { data: materials, isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await api.get('/materials')).data,
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log('Submitting Material FormData:', data.get('name'));
      if (editingMaterial) {
        return await api.put(`/materials/${editingMaterial.id}`, data);
      }
      return await api.post('/materials', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      handleCloseModal();
    },
    onError: (error: any) => {
      console.error('Erro na mutação material:', error);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/materials/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['materials'] }),
  });

  const handleOpenModal = (material: any = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({ name: material.name, unit: material.unit || 'un' });
      setPreview(material.imageUrl);
      
      const parsedComps = material.components 
        ? (typeof material.components === 'string' ? JSON.parse(material.components) : material.components) 
        : null;
      if (Array.isArray(parsedComps) && parsedComps.length > 0) {
        setIsGrouped(true);
        setCompositeComponents(parsedComps);
      } else {
        setIsGrouped(false);
        setCompositeComponents([]);
      }
    } else {
      setEditingMaterial(null);
      setFormData({ name: '', unit: 'un' });
      setPreview(null);
      setIsGrouped(false);
      setCompositeComponents([]);
    }
    setFile(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMaterial(null);
    setFormData({ name: '', unit: 'un' });
    setFile(null);
    setPreview(null);
    setIsGrouped(false);
    setCompositeComponents([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = new FormData();
    data.append('name', formData.name);
    data.append('unit', formData.unit);
    if (file) {
      data.append('image', file);
    } else if (!preview && editingMaterial) {
      data.append('removeImage', 'true');
    }
    
    if (isGrouped && compositeComponents.length > 0) {
      const validComponents = compositeComponents.filter(c => c.materialId !== '');
      data.append('components', JSON.stringify(validComponents));
    } else {
      data.append('components', '[]');
    }

    mutation.mutate(data);
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materiais</h1>
          <p className="text-gray-600">Gerencie o catálogo de materiais disponíveis.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5 mr-2" /> Novo Material
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Carregando materiais...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {materials?.map((material: any) => (
            <div key={material.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden group relative">
              <div className="aspect-square bg-gray-100 flex items-center justify-center relative overflow-hidden">
                {material.imageUrl ? (
                  <img src={material.imageUrl} alt={material.name} className="object-cover w-full h-full" />
                ) : (
                  <Package className="h-12 w-12 text-gray-400" />
                )}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button onClick={() => handleOpenModal(material)} className="p-2 bg-white rounded-full text-blue-600 mr-2 hover:scale-110 transition-transform">
                    <Edit className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => setConfirmDialog({ isOpen: true, materialId: material.id })} 
                    className="p-2 bg-white rounded-full text-red-600 hover:scale-110 transition-transform"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="p-4 text-center">
                <p className="font-medium text-gray-900 truncate">{material.name}</p>
                <div className="flex justify-center flex-wrap gap-1 mt-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-500">
                    {material.unit === 'm' ? 'Metros (m)' : 'Unidade (un)'}
                  </span>
                  {material.components && (typeof material.components === 'string' ? JSON.parse(material.components) : material.components)?.length > 0 && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-100">
                      Grupo
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        title={editingMaterial ? 'Editar Material' : 'Novo Material'}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg flex items-center">
              <X className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>Erro ao salvar material. {(mutation.error as any)?.response?.data?.error || 'Verifique sua conexão.'}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Imagem</label>
            <div className="flex flex-col items-center">
              <label className="relative cursor-pointer group w-full">
                <div className={`w-full aspect-video rounded-xl bg-gray-50 border-2 border-dashed ${preview ? 'border-blue-200' : 'border-gray-300'} flex flex-col items-center justify-center overflow-hidden hover:border-blue-500 hover:bg-blue-50 transition-all group-relative`}>
                  {preview ? (
                    <>
                      <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="flex flex-col items-center text-white">
                          <Camera className="h-8 w-8 mb-2" />
                          <span className="text-xs font-medium uppercase tracking-wider">Alterar Imagem</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-gray-400 group-hover:text-blue-500 transition-colors">
                      <div className="p-4 bg-white rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                        <Camera className="h-8 w-8" />
                      </div>
                      <p className="text-sm font-semibold">Clique para enviar imagem</p>
                      <p className="text-xs">PNG, JPG ou WEBP até 5MB</p>
                    </div>
                  )}
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
              </label>
              
              {preview && (
                <button 
                  type="button" 
                  onClick={() => { setFile(null); setPreview(null); }}
                  className="mt-2 text-xs text-red-600 font-medium flex items-center hover:text-red-700"
                >
                  <X className="h-3 w-3 mr-1" /> Remover Imagem
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Material</label>
            <input
              type="text"
              required
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Unidade de Medida</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, unit: 'un' })}
                className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  formData.unit === 'un'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-blue-200 bg-white'
                }`}
              >
                Unidade (un)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, unit: 'm' })}
                className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  formData.unit === 'm'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-blue-200 bg-white'
                }`}
              >
                Metros (m)
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={isGrouped}
                onChange={(e) => setIsGrouped(e.target.checked)}
              />
              <span>Este é um material agrupado (composição)</span>
            </label>
            <p className="text-xs text-gray-500 mb-4 ml-6">
              Materiais agrupados não aparecem em detalhe no relatório; ao invés, são expandidos em seus componentes individuais.
            </p>

            {isGrouped && (
              <div className="ml-6 space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider block">Materiais que compõem este grupo:</span>
                
                {compositeComponents.map((comp, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      required
                      value={comp.materialId}
                      onChange={(e) => {
                        const updated = [...compositeComponents];
                        updated[idx].materialId = e.target.value;
                        setCompositeComponents(updated);
                      }}
                      className="flex-1 p-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 animate-fade-in"
                    >
                      <option value="">Selecione um material...</option>
                      {materials
                        ?.filter((m: any) => {
                          if (m.id === editingMaterial?.id) return false;
                          const comps = m.components 
                            ? (typeof m.components === 'string' ? JSON.parse(m.components) : m.components) 
                            : null;
                          const isComposition = Array.isArray(comps) && comps.length > 0;
                          return !isComposition;
                        })
                        ?.map((m: any) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit || 'un'})</option>
                        ))
                      }
                    </select>

                    <input
                      type="number"
                      min="1"
                      required
                      value={comp.quantity}
                      onChange={(e) => {
                        const updated = [...compositeComponents];
                        updated[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                        setCompositeComponents(updated);
                      }}
                      className="w-20 p-2 bg-white border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500"
                      placeholder="Qtd"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setCompositeComponents(compositeComponents.filter((_, i) => i !== idx));
                      }}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setCompositeComponents([...compositeComponents, { materialId: '', quantity: 1 }]);
                  }}
                  className="mt-2 text-xs text-blue-600 font-semibold hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Adicionar Componente
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="animate-spin h-5 w-5" /> : (
                <>
                  <Save className="h-5 w-5 mr-2" /> {editingMaterial ? 'Salvar' : 'Criar'}
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Excluir Material"
        message="Tem certeza que deseja excluir este material?"
        onClose={() => setConfirmDialog({ isOpen: false, materialId: '' })}
        onConfirm={() => deleteMutation.mutate(confirmDialog.materialId)}
      />
    </Layout>
  );
}
