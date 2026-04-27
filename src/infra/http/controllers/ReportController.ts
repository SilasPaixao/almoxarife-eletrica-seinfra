import { Response } from 'express';
import prisma from '../../database/prisma.ts';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun } from 'docx';
import { startOfWeek, endOfWeek, format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import { AuthRequest } from '../middlewares/auth.middleware.ts';

export class ReportController {
  static async getWeekly(req: AuthRequest, res: Response) {
    try {
      const now = new Date();
      // Monday = 1, Sunday = 0
      // We want Monday to Saturday
      const weekStart = startOfDay(startOfWeek(now, { weekStartsOn: 1 }));
      const weekEnd = endOfDay(subDays(endOfWeek(now, { weekStartsOn: 1 }), 1)); // Saturday

      const demands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: { in: ['CONCLUDED'] }
        },
        include: {
          electrician: true,
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { electricianId: 'asc' }
      });

      const grouped = demands.reduce((acc: any, demand) => {
        const name = demand.electrician.name;
        if (!acc[name]) acc[name] = [];
        acc[name].push(demand);
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
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const { start, end } = req.query;
      const weekStart = startOfDay(new Date(start as string));
      const weekEnd = endOfDay(new Date(end as string));

      const demands = await prisma.demand.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          status: { in: ['CONCLUDED'] }
        },
        include: {
          electrician: true,
          usedMaterials: { include: { material: true } },
          returnedMaterials: { include: { material: true } },
        },
        orderBy: { electricianId: 'asc' }
      });

      const doc = new PDFDocument({ margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}.pdf`);
      doc.pipe(res);

      // Logo
      try {
        const logoResponse = await axios.get('https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png', { responseType: 'arraybuffer' });
        doc.image(logoResponse.data, 50, 45, { width: 100 });
      } catch (e) {}

      doc.fontSize(16).text('RELATÓRIO ALMOXARIFADO ELÉTRICA - SEINFRA', 160, 60, { align: 'center' });
      doc.fontSize(12).text(`Período: ${format(weekStart, 'dd/MM/yyyy')} a ${format(weekEnd, 'dd/MM/yyyy')}`, 160, 85, { align: 'center' });
      doc.moveDown(4);

      const grouped = demands.reduce((acc: any, demand) => {
        const name = demand.electrician.name;
        if (!acc[name]) acc[name] = [];
        acc[name].push(demand);
        return acc;
      }, {});

      for (const [electricianName, eDemands] of Object.entries(grouped) as any[]) {
        doc.fontSize(14).text(`ELETRICISTA: ${electricianName.toUpperCase()}`, { underline: true });
        doc.moveDown();

        for (const d of eDemands) {
          doc.fontSize(12).text(`Data: ${format(new Date(d.date), 'dd/MM/yyyy')} | Local: ${d.location}`);
          doc.fontSize(10).text(`Descrição: ${d.description}`);
          
          doc.text('Materiais Utilizados:');
          d.usedMaterials.forEach((m: any) => {
            doc.text(`- ${m.quantity}x ${m.material.name}`);
          });

          doc.text('Materiais Retornados:');
          d.returnedMaterials.forEach((m: any) => {
            doc.text(`- ${m.quantity}x ${m.material.name} (${m.type})`);
          });
          
          doc.moveDown();
        }
        doc.addPage();
      }

      // Signatures at the end (could be on the last page or each page)
      doc.fontSize(12);
      const y = 650;
      doc.text('____________________', 50, y);
      doc.text('Coordenador', 50, y + 15);
      
      doc.text('____________________', 250, y);
      doc.text('Secretário', 250, y + 15);

      doc.text('____________________', 450, y);
      doc.text('Almoxarife', 450, y + 15);

      doc.end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async downloadDocx(req: AuthRequest, res: Response) {
    try {
      const { start, end } = req.query;
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "RELATÓRIO ALMOXARIFADO ELÉTRICA - SEINFRA",
                  bold: true,
                  size: 32,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Período: ${start} a ${end}`,
                  size: 24,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-${start}.docx`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

