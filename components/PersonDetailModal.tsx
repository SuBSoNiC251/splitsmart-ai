import React from 'react';
import { PersonSummary } from '../types';

interface PersonDetailModalProps {
  person: PersonSummary;
  currencySymbol: string;
  onClose: () => void;
}

const PersonDetailModal: React.FC<PersonDetailModalProps> = ({ person, currencySymbol, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex md:items-center justify-center items-end bg-black/50 backdrop-blur-sm md:p-4 animate-in fade-in duration-200">
      {/* Overlay click to close */}
      <div className="absolute inset-0" onClick={onClose}></div>

      <div className="bg-white md:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] md:max-h-[90vh] relative z-10 animate-in slide-in-from-bottom duration-300 md:zoom-in-95">
        
        {/* Mobile Drag Handle */}
        <div className="md:hidden w-full flex justify-center pt-3 pb-1" onClick={onClose}>
            <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="px-6 py-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                  {person.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 leading-none">{person.name}</h2>
                <p className="text-slate-500 text-xs mt-1">Bill Breakdown</p>
              </div>
           </div>
           <button 
             onClick={onClose} 
             className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-2 transition-colors"
             aria-label="Close"
           >
              <span className="material-icons text-xl">close</span>
           </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/30">
            <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                <span className="material-icons text-sm">shopping_bag</span>
                Ordered Items
            </h3>
            <div className="space-y-3">
                {person.items.length === 0 ? (
                    <p className="text-slate-400 text-sm italic text-center py-4">No items assigned yet.</p>
                ) : (
                    person.items.map((item, idx) => {
                    const sharePrice = item.price / item.assignedTo.length;
                    return (
                        <div key={`${item.id}-${idx}`} className="flex justify-between items-start py-3 border-b border-slate-100 last:border-0">
                            <div className="pr-4 flex-1">
                                <span className="text-slate-800 font-medium block text-sm leading-snug">{item.name}</span>
                                {item.assignedTo.length > 1 && (
                                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-wide">
                                        <span className="material-icons text-[10px]">call_split</span>
                                        Split {item.assignedTo.length} ways
                                    </span>
                                )}
                            </div>
                            <span className="text-slate-900 font-bold text-sm whitespace-nowrap">
                                {currencySymbol}{sharePrice.toFixed(2)}
                            </span>
                        </div>
                    );
                    })
                )}
            </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-6 border-t border-slate-200 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-6">
            <div className="space-y-2 text-sm text-slate-600 mb-4">
                <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-medium">{currencySymbol}{person.subtotalOwed.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Tax & Fees</span>
                    <span className="font-medium">{currencySymbol}{person.taxOwed.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Tip</span>
                    <span className="font-medium">{currencySymbol}{person.tipOwed.toFixed(2)}</span>
                </div>
            </div>
            <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
                <span className="text-lg font-bold text-slate-800">Total Owed</span>
                <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">{currencySymbol}{person.totalOwed.toFixed(2)}</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PersonDetailModal;