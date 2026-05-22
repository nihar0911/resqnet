import React, { useEffect, useRef, useState } from 'react';
import { useDisasterStore } from '../store/useDisasterStore';
import type { TimelineEvent } from '../store/useDisasterStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, ShieldAlert, Waves, Heart, Radio, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';

export const Timeline: React.FC = () => {
  const timelineEvents = useDisasterStore(state => state.timelineEvents);
  const disasters = useDisasterStore(state => state.disasters);
  const sosRequests = useDisasterStore(state => state.sosRequests);
  const selectedCity = useDisasterStore(state => state.selectedCity);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportToPdf = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Generating SitRep PDF report...');
    try {
      const activeDisasters = disasters.filter(d => d.status === 'active');
      const pendingSos = sosRequests.filter(s => s.status === 'pending');
      const rescuedSos = sosRequests.filter(s => s.status === 'rescued');

      const reportEl = document.createElement('div');
      reportEl.style.position = 'absolute';
      reportEl.style.left = '-9999px';
      reportEl.style.width = '800px';
      reportEl.style.backgroundColor = '#ffffff';
      reportEl.style.color = '#0f172a';
      reportEl.style.padding = '40px';
      reportEl.style.fontFamily = 'Arial, sans-serif';

      reportEl.innerHTML = `
        <div style="border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="font-size: 26px; font-weight: 800; color: #0284c7; margin: 0; text-transform: uppercase;">ResqNet Crisis Command SitRep</h1>
          <div style="font-size: 11px; color: #64748b; margin-top: 5px; font-weight: 600;">
            CITY SECTOR: ${selectedCity.toUpperCase()} &nbsp;|&nbsp; 
            REPORT TIMESTAMP: ${new Date().toLocaleString()} &nbsp;|&nbsp; 
            COMMUNICATION GRID: LOCAL MESH ACTIVE
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">TACTICAL TELEMETRY SUMMARY</h2>
          <div style="display: flex; gap: 20px; font-size: 11px;">
            <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Active Disasters</span>
              <strong style="font-size: 22px; color: #ef4444; display: block; margin-top: 5px;">${activeDisasters.length}</strong>
            </div>
            <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Pending SOS Beacons</span>
              <strong style="font-size: 22px; color: #f59e0b; display: block; margin-top: 5px;">${pendingSos.length}</strong>
            </div>
            <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center;">
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Rescued Civilians</span>
              <strong style="font-size: 22px; color: #10b981; display: block; margin-top: 5px;">${rescuedSos.reduce((sum, s) => sum + s.occupants, 0)}</strong>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">ACTIVE DISASTER SECTORS</h2>
          ${activeDisasters.length === 0 ? '<p style="font-size: 12px; color: #64748b; font-style: italic;">No active threat overlays detected.</p>' : `
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background-color: #f1f5f9; text-align: left; font-weight: bold; color: #475569;">
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Disaster Name</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Type</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Threat Level</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Radius</th>
                </tr>
              </thead>
              <tbody>
                ${activeDisasters.map(d => `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${d.name}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-transform: capitalize;">${d.type.replace('_', ' ')}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #b91c1c;">${d.severity}/10</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1;">${Math.round(d.radius)}m</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">PENDING EMERGENCY SOS REGISTER</h2>
          ${pendingSos.length === 0 ? '<p style="font-size: 12px; color: #64748b; font-style: italic;">No pending civilian SOS beacons active.</p>' : `
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background-color: #f1f5f9; text-align: left; font-weight: bold; color: #475569;">
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Name / Sender</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Type</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Message Details</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Severity</th>
                  <th style="padding: 8px; border: 1px solid #cbd5e1;">Pax</th>
                </tr>
              </thead>
              <tbody>
                ${pendingSos.map(s => `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${s.name}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-transform: capitalize;">${s.type}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-style: italic;">"${s.message}"</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #d97706;">${s.severity.toUpperCase()}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${s.occupants}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div>
          <h2 style="font-size: 16px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">COMMAND HUD INCIDENT LOG</h2>
          <div style="font-size: 10px; line-height: 1.5; color: #334155;">
            ${timelineEvents.slice(0, 15).map(e => `
              <div style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex;">
                <span style="width: 70px; color: #64748b; font-weight: 600;">[${e.timestamp}]</span>
                <span style="width: 100px; font-weight: 700; color: ${e.severity === 'critical' ? '#b91c1c' : e.severity === 'medium' ? '#d97706' : '#047857'}">[${e.type.toUpperCase()}]</span>
                <span style="flex: 1;">${e.text}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      document.body.appendChild(reportEl);

      const canvas = await html2canvas(reportEl, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `RESQNET_SitRep_${selectedCity}_${Date.now()}.pdf`;
      pdf.save(filename);
      document.body.removeChild(reportEl);
      toast.success('SitRep PDF downloaded successfully!', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to export incident report PDF.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    // Keep timeline scrolled to top (newest are added at the start of the array)
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [timelineEvents]);

  const getEventStyles = (severity: TimelineEvent['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'rgba(239, 68, 68, 0.04)',
          border: 'border-red-500/20',
          text: 'text-red-400',
          bullet: 'bg-red-500'
        };
      case 'medium':
        return {
          bg: 'rgba(245, 158, 11, 0.04)',
          border: 'border-amber-500/20',
          text: 'text-amber-400',
          bullet: 'bg-amber-500'
        };
      case 'low':
      default:
        return {
          bg: 'rgba(16, 185, 129, 0.04)',
          border: 'border-emerald-500/15',
          text: 'text-slate-300',
          bullet: 'bg-emerald-500'
        };
    }
  };

  const getEventIcon = (type: TimelineEvent['type']) => {
    const cn = "w-4 h-4";
    switch (type) {
      case 'disaster':
        return <Waves className={`${cn} text-sky-400`} />;
      case 'sos':
        return <ShieldAlert className={`${cn} text-red-400`} />;
      case 'rescue':
        return <Heart className={`${cn} text-emerald-400`} />;
      case 'offline':
        return <Radio className={`${cn} text-amber-550 animate-pulse`} />;
      case 'system':
      default:
        return <Terminal className={`${cn} text-sky-400`} />;
    }
  };

  const getEventName = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'disaster':
        return 'Crisis event';
      case 'sos':
        return 'SOS alert';
      case 'rescue':
        return 'Rescue squad';
      case 'offline':
        return 'Connection';
      case 'system':
      default:
        return 'System log';
    }
  };

  return (
    <div className="glass-panel bg-slate-900/60 border border-slate-800 p-6 rounded-xl flex flex-col h-full relative overflow-hidden select-none">
      {/* Incident Log Header */}
      <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <Terminal className="w-5 h-5 text-sky-400" />
          <h2 className="font-bold text-base text-slate-100">Incident Log Feed</h2>
        </div>
        <button
          onClick={exportToPdf}
          disabled={isExporting}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition font-bold text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? 'Exporting...' : 'Export SitRep PDF'}</span>
        </button>
      </div>

      {/* Timeline Scroll Box */}
      <div 
        ref={containerRef}
        className="flex-grow overflow-y-auto space-y-3.5 pr-1 scroll-smooth select-none max-h-[300px] lg:max-h-[360px]"
      >
        <AnimatePresence initial={false}>
          {timelineEvents.map((event) => {
            const styles = getEventStyles(event.severity);
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className={`p-4 rounded-xl border ${styles.border} ${styles.bg} flex items-start space-x-3.5 overflow-hidden`}
              >
                {/* Visual Bullet & Icon */}
                <div className="flex flex-col items-center mt-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${styles.bullet}`} />
                  <div className="w-[1px] h-6 bg-slate-800 mt-2" />
                </div>

                {/* Event Details */}
                <div className="flex-grow space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-semibold">
                    <span className="flex items-center space-x-1">
                      {getEventIcon(event.type)}
                      <span className="ml-1">{getEventName(event.type)}</span>
                    </span>
                    <span className="text-slate-500 font-normal">{event.timestamp}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200 font-normal">
                    {event.text}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {timelineEvents.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-8 font-medium">
            Standby... Registry is empty.
          </div>
        )}
      </div>
    </div>
  );
};
