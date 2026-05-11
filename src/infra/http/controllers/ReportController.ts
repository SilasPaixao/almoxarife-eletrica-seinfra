import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun } from 'docx';
import { startOfWeek, endOfWeek, format, subDays, startOfDay, endOfDay, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import { AuthRequest } from '../middlewares/auth.middleware.ts';

export class ReportController {
  // ... (getWeekly remains mostly similar but let's ensure it's clean)
  static async getWeekly(req: AuthRequest, res: Response) {
    try {
      const now = new Date();
      const weekStart = startOfDay(startOfWeek(now, { weekStartsOn: 1 }));
      const weekEnd = endOfDay(subDays(endOfWeek(now, { weekStartsOn: 1 }), 1)); 

      const demands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: { in: ['CONCLUDED'] }
        },
        include: {
          electricians: true,
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'asc' }
      });

      const grouped = demands.reduce((acc: any, demand: any) => {
        demand.electricians.forEach((e: any) => {
          const name = e.name;
          if (!acc[name]) acc[name] = [];
          acc[name].push(demand);
        });
        return acc;
      }, {});

      res.json({
        period: {
          start: format(weekStart, 'dd/MM/yyyy'),
          end: format(weekEnd, 'dd/MM/yyyy'),
        },
        data: grouped
      });
    } catch (error) {
      console.error('[ReportController.getWeekly] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const { start, end } = req.query;
      
      if (!start || !end) {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      // Parse dd/MM/yyyy format
      const weekStart = startOfDay(parse(start as string, 'dd/MM/yyyy', new Date()));
      const weekEnd = endOfDay(parse(end as string, 'dd/MM/yyyy', new Date()));

      if (isNaN(weekStart.getTime()) || isNaN(weekEnd.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use dd/MM/yyyy' });
      }

      const demands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: 'CONCLUDED'
        },
        include: {
          electricians: true,
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'asc' }
      });

      const doc = new PDFDocument({ 
        margin: 50,
        info: {
          Title: 'Relatório Semanal de Manutenção Elétrica',
          Author: 'SISTEMA SEINFRA',
        }
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}.pdf`);
      doc.pipe(res);

      // --- CAPA PROFISSIONAL ---
      // Background Accent (Top Rectangle)
      doc.rect(0, 0, 612, 150).fill('#0284c7');
      
      try {
        const logoResponse = await axios.get('https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png', { responseType: 'arraybuffer' });
        doc.image(logoResponse.data, 256, 40, { width: 100 });
      } catch (e) {}

      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('RELATÓRIO SEMANAL', 0, 180, { align: 'center' });
      doc.fontSize(18).text('ALMOXARIFADO DE ELÉTRICA', 0, 210, { align: 'center' });
      
      doc.fillColor('#333333').font('Helvetica').fontSize(14).text(`PERÍODO: ${start} À ${end}`, 0, 260, { align: 'center' });
      
      doc.rect(150, 290, 312, 2).fill('#0284c7');
      
      doc.fillColor('#666666').fontSize(12).text('SECRETARIA DE INFRAESTRUTURA - SEINFRA', 0, 700, { align: 'center' });
      doc.text(format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }), 0, 720, { align: 'center' });
      
      doc.addPage();

      // --- CONTEÚDO DAS DEMANDAS ---
      const totals: any = { used: {}, returned: {}, totalDemands: demands.length };
      doc.fillColor('#000000'); // Reset color

      const grouped = demands.reduce((acc: any, demand: any) => {
        demand.electricians.forEach((e: any) => {
          const name = e.name;
          if (!acc[name]) acc[name] = [];
          acc[name].push(demand);
        });
        return acc;
      }, {});

      for (const [electricianName, eDemands] of Object.entries(grouped) as any[]) {
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#0284c7').text(`EQUIPE: ${electricianName.toUpperCase()}`, { underline: true });
        doc.moveDown(0.5);
        doc.fillColor('#000000');

        for (const d of eDemands) {
          // Demand Header
          doc.rect(50, doc.y, 512, 20).fill('#f1f5f9');
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(`${format(new Date(d.date), 'dd/MM/yyyy')} - ${d.location}`, 60, doc.y - 15);
          doc.moveDown(0.5);
          doc.fillColor('#475569').font('Helvetica').fontSize(10).text(`Descrição: ${d.description}`, { oblique: true });
          
          doc.moveDown(0.5);
          doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10).text('EQUIPE RESPONSÁVEL:');
          doc.font('Helvetica').fontSize(9).text(d.electricians.map((e: any) => e.name).join(', '));
          doc.moveDown(0.3);

          // Grid for Materials
          const currentY = doc.y;
          const colWidth = 250;

          // Left Column: Materials
          doc.font('Helvetica-Bold').fontSize(10).text('MATERIAIS PLANEJADOS:', 50, currentY);
          d.plannedMaterials.forEach((m: any) => {
            doc.font('Helvetica').fontSize(9).text(`• ${String(m.quantity).padStart(2, '0')} ${m.material.unit || 'un'} - ${m.material.name}`, 60);
          });

          doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(10).text('MATERIAIS UTILIZADOS:');
          if (d.usedMaterials.length === 0) {
            doc.font('Helvetica').fontSize(9).text('Nenhum material utilizado.');
          } else {
            d.usedMaterials.forEach((m: any) => {
              doc.font('Helvetica').fontSize(9).text(`• ${String(m.quantity).padStart(2, '0')} ${m.material.unit || 'un'} - ${m.material.name}`);
              const key = m.material.id;
              if (!totals.used[key]) totals.used[key] = { name: m.material.name, unit: m.material.unit, quantity: 0 };
              totals.used[key].quantity += m.quantity;
            });
          }

          // Surplus and Others
          doc.moveDown(0.3);
          const surplus = d.returnedMaterials.filter((m: any) => m.type === 'NOT_USED');
          doc.font('Helvetica-Bold').fontSize(10).text('MATERIAIS PARA RETORNO (SOBRA):');
          if (surplus.length === 0) {
            doc.font('Helvetica').fontSize(9).text('Nenhuma sobra registrada.');
          } else {
            surplus.forEach((m: any) => {
              doc.font('Helvetica').fontSize(9).text(`• ${String(m.quantity).padStart(2, '0')} ${m.material.unit || 'un'} - ${m.material.name}`);
            });
          }

          const damaged = d.returnedMaterials.filter((m: any) => m.type === 'DAMAGED' || m.type === 'DEFECTIVE');
          if (damaged.length > 0) {
            doc.moveDown(0.3);
            doc.font('Helvetica-Bold').fontSize(10).text('MATERIAIS DANIFICADOS:');
            damaged.forEach((m: any) => {
              doc.font('Helvetica').fontSize(9).text(`• ${String(m.quantity).padStart(2, '0')} ${m.material.unit || 'un'} - ${m.material.name} (DANIFICADO)`);
              const key = `DAMAGED-${m.material.id}`;
              if (!totals.returned[key]) totals.returned[key] = { name: m.material.name, unit: m.material.unit, quantity: 0, type: 'Danificado' };
              totals.returned[key].quantity += m.quantity;
            });
          }

          // Vehicles and Ladder
          doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(10).text('RECURSOS UTILIZADOS:');
          const resources = [];
          if (d.vehicles && d.vehicles.length > 0) resources.push(`Veículos: ${d.vehicles.join(', ')}`);
          if (d.ladder) resources.push(`Escada: ${d.ladder}`);
          
          if (resources.length === 0) {
            doc.font('Helvetica').fontSize(9).text('Nenhum recurso extra registrado.');
          } else {
            resources.forEach(r => doc.font('Helvetica').fontSize(9).text(`• ${r}`));
          }
          
          doc.moveDown();
          doc.rect(50, doc.y, 512, 1).fill('#e2e8f0').moveDown(0.5);

          // Check for page break
          if (doc.y > 650) doc.addPage();
        }
        doc.addPage();
      }

      // --- DASHBOARD DE RESUMO GERAL ---
      doc.rect(0, 0, 612, 80).fill('#0f172a');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('DASHBOARD SEMANAL - RESUMO DE OPERAÇÕES', 0, 30, { align: 'center' });
      
      doc.fillColor('#000000').fontSize(12).text(`TOTAL DE DEMANDAS ATENDIDAS NO PERÍODO: ${totals.totalDemands}`, 50, 100);
      doc.moveDown(1);

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0284c7').text('TOTAL DE MATERIAIS UTILIZADOS NA SEMANA:');
      doc.moveDown(0.5);
      doc.fillColor('#000000');
      const usedSorted = Object.values(totals.used).sort((a: any, b: any) => a.name.localeCompare(b.name));
      if (usedSorted.length === 0) {
        doc.font('Helvetica').fontSize(10).text('Nenhum material utilizado no período.');
      } else {
        // Simple 2-column layout for summary
        let col = 0;
        let startY = doc.y;
        usedSorted.forEach((m: any, index) => {
          if (index > 0 && index % 20 === 0) {
            doc.addPage();
            startY = 50;
          }
          const text = `• ${String(m.quantity).padStart(3, '0')} ${m.unit || 'un'} - ${m.name}`;
          doc.font('Helvetica').fontSize(9).text(text, col === 0 ? 50 : 320, startY + (index % 20) * 12);
          if (index % 2 === 1) {} // just logical split
        });
        doc.moveDown(Math.ceil(usedSorted.length / 2) * 0.5 + 1);
      }

      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#b91c1c').text('TOTAL DE MATERIAIS DANIFICADOS RECOLHIDOS:');
      doc.moveDown(0.5);
      doc.fillColor('#000000');
      const returnedSorted = Object.values(totals.returned).sort((a: any, b: any) => a.name.localeCompare(b.name));
      if (returnedSorted.length === 0) {
        doc.font('Helvetica').fontSize(10).text('Nenhum material danificado registrado.');
      } else {
        returnedSorted.forEach((m: any) => {
          doc.font('Helvetica').fontSize(10).text(`• ${String(m.quantity).padStart(3, '0')} ${m.unit || 'un'} - ${m.name}`);
        });
      }

      // Signatures at the end
      doc.font('Helvetica').fontSize(10);
      const signY = 700;
      doc.text('__________________________', 50, signY, { width: 150, align: 'center' });
      doc.text('COORDENADOR DE ELÉTRICA', 50, signY + 15, { width: 150, align: 'center' });
      
      doc.text('__________________________', 230, signY, { width: 150, align: 'center' });
      doc.text('SECRETÁRIO DE INFRA', 230, signY + 15, { width: 150, align: 'center' });

      doc.text('__________________________', 410, signY, { width: 150, align: 'center' });
      doc.text('ALMOXARIFE / RESPONSÁVEL', 410, signY + 15, { width: 150, align: 'center' });

      doc.end();
    } catch (error) {
      console.error('[ReportController.downloadPdf] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async downloadDocx(req: AuthRequest, res: Response) {
    try {
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ error: 'Start and end dates are required' });

      const weekStart = startOfDay(parse(start as string, 'dd/MM/yyyy', new Date()));
      const weekEnd = endOfDay(parse(end as string, 'dd/MM/yyyy', new Date()));

      const demands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: 'CONCLUDED'
        },
        include: {
          electricians: true,
          plannedMaterials: { include: { material: true } },
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { date: 'asc' }
      });

      const children: any[] = [
        new Paragraph({
          children: [
            new TextRun({
              text: "RELATÓRIO ALMOXARIFADO ELÉTRICA - SEINFRA",
              bold: true,
              size: 32,
              color: '0284c7'
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Período: ${start} a ${end}`,
              size: 24,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),
      ];

      // Add demand info to DOCX
      demands.forEach(d => {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `DATA: ${format(new Date(d.date), 'dd/MM/yyyy')} - LOCAL: ${d.location}`, bold: true, size: 22 })
          ],
          spacing: { before: 200 }
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `DESCRIÇÃO: ${d.description}`, italic: true, size: 20 })]
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `EQUIPE: ${d.electricians.map((e: any) => e.name).join(', ')}`, size: 20 })]
        }));
        
        children.push(new Paragraph({ children: [new TextRun({ text: "MATERIAIS PLANEJADOS:", bold: true, size: 20 })], spacing: { before: 100 } }));
        d.plannedMaterials.forEach((m: any) => {
          children.push(new Paragraph({ children: [new TextRun({ text: `• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, size: 18 })] }));
        });

        children.push(new Paragraph({ children: [new TextRun({ text: "MATERIAIS UTILIZADOS:", bold: true, size: 20 })], spacing: { before: 100 } }));
        d.usedMaterials.forEach((m: any) => {
          children.push(new Paragraph({ children: [new TextRun({ text: `• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, size: 18 })] }));
        });

        const surplus = d.returnedMaterials.filter((m: any) => m.type === 'NOT_USED');
        if (surplus.length > 0) {
          children.push(new Paragraph({ children: [new TextRun({ text: "MATERIAIS PARA RETORNO (SOBRA):", bold: true, size: 20 })], spacing: { before: 100 } }));
          surplus.forEach((m: any) => {
            children.push(new Paragraph({ children: [new TextRun({ text: `• ${m.quantity} ${m.material.unit || 'un'} - ${m.material.name}`, size: 18 })] }));
          });
        }

        const resources = [];
        if (d.vehicles && d.vehicles.length > 0) resources.push(`Veículos: ${d.vehicles.join(', ')}`);
        if (d.ladder) resources.push(`Escada: ${d.ladder}`);
        if (resources.length > 0) {
          children.push(new Paragraph({ children: [new TextRun({ text: "RECURSOS UTILIZADOS:", bold: true, size: 20 })], spacing: { before: 100 } }));
          resources.forEach(r => {
            children.push(new Paragraph({ children: [new TextRun({ text: `• ${r}`, size: 18 })] }));
          });
        }

        children.push(new Paragraph({ children: [new TextRun({ text: "----------------------------------------------------" })], spacing: { before: 200, after: 200 } }));
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}.docx`);
      res.send(buffer);
    } catch (error) {
      console.error('[ReportController.downloadDocx] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

