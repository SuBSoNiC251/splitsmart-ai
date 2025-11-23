import React, { useState } from 'react';
import { ReceiptData } from '../types';

interface ReceiptViewProps {
  data: ReceiptData;
  originalImage?: string | null;
  className?: string;
}

const ReceiptView: React.FC<ReceiptViewProps> = ({ data, originalImage, className }) => {
  const [viewMode, setViewMode] = useState<'list' | 'image'>('list');
  const currency = data.currencySymbol || '$';

  // Calculate discrepancies
  const computedSum = data.subtotal + data.tax + data.tip;
  const discrepancy = data.total - computedSum;
  const showAdjustment = Math.abs(discrepancy) > 0.05;

  let displayTotal = data.total;
  if (data.discount) {
      if (data.discount.type === 'percentage') {
          displayTotal = data.total * (1 - data.discount.value / 100);
      } else {
          displayTotal = data.total - data.discount.value;
      }
  }

  const handleOpenImage = () => {
      if (originalImage) {
          const win = window.open();
          if (win) {
            win.document.write(`<img src="data:image/jpeg;base64,${originalImage}" style="max-width:100%; height:auto;" />`);
          }
      }
  };

  return (
    <div className={`bg-white shadow-none md:shadow-lg md:rounded-xl overflow-hidden flex flex-col h-full border-0 md:border border-slate-200 ${className}`}>
      {/* Header with Toggle */}
      <div className="bg-white p-4 border-b border-slate-100 flex flex-col gap-4 sticky top-0 z-10 shadow-sm">
        <div className="flex justify-between items-start">
            <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate max-w-[200px] md:max-w-none">
                <span className="material-icons text-blue-600">storefront</span>
                {data.merchantName || "Receipt Details"}
                </h2>
                {(data.location || data.date) && (
                    <p className="text-xs text-slate-500 ml-8 mt-1 flex flex-col">
                        {data.location && <span className="truncate">{data.location}</span>}
                        {data.date && <span>{data.date}</span>}
                    </p>
                )}
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            {data.items.length} items
            </span>
        </div>

        {/* View Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
                onClick={() => setViewMode('list')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all touch-manipulation ${
                    viewMode === 'list' 
                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                <span className="material-icons text-[16px]">list</span>
                Parsed List
            </button>
            <button 
                onClick={() => setViewMode('image')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all touch-manipulation ${
                    viewMode === 'image' 
                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
            >
                <span className="material-icons text-[16px]">image</span>
                Original
            </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/30 relative pb-20 md:pb-0">
        {viewMode === 'image' ? (
             originalImage ? (
                <div className="h-full w-full overflow-auto p-4 flex flex-col items-center justify-start bg-slate-100 min-h-[300px]">
                     <div className="w-full flex justify-end mb-2">
                         <button 
                            onClick={handleOpenImage}
                            className="text-xs text-blue-600 font-bold bg-white px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1 hover:bg-blue-50 active:scale-95 transition-transform"
                         >
                             <span className="material-icons text-sm">open_in_full</span>
                             Expand
                         </button>
                     </div>
                    <img 
                        src={`data:image/jpeg;base64,${originalImage}`} 
                        alt="Original Receipt" 
                        className="max-w-full h-auto object-contain rounded-lg shadow-sm border border-slate-300" 
                    />
                </div>
             ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
                    <span className="material-icons text-4xl mb-2">broken_image</span>
                    <p>Original image not available</p>
                </div>
             )
        ) : (
            // List View
            <div className="p-3 space-y-3">
                {data.items.length === 0 ? (
                <div className="text-center text-slate-400 mt-10 p-4">
                    <span className="material-icons text-4xl mb-2">sentiment_dissatisfied</span>
                    <p>No items found on this receipt.</p>
                </div>
                ) : (
                data.items.map((item) => (
                    <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border shadow-sm transition-all duration-200 ${
                        item.assignedTo.length > 0
                        ? 'bg-blue-50/50 border-blue-200'
                        : 'bg-white border-slate-200'
                    }`}
                    >
                    <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-slate-800 text-sm leading-snug flex-1 mr-3">
                        {item.name}
                        </span>
                        <span className="font-bold text-slate-900 text-sm whitespace-nowrap">
                        {currency}{item.price.toFixed(2)}
                        </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5">
                        {item.assignedTo.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic flex items-center gap-1">
                            <span className="material-icons text-[14px]">help_outline</span>
                            Unassigned
                        </span>
                        ) : (
                        item.assignedTo.map((person, idx) => (
                            <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-white text-blue-700 border border-blue-100 shadow-sm"
                            >
                            {person}
                            </span>
                        ))
                        )}
                    </div>
                    </div>
                ))
                )}
            </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white p-5 border-t border-slate-200 space-y-1.5 text-sm z-10 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-5 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{currency}{data.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Tax</span>
          <span>{currency}{data.tax.toFixed(2)}</span>
        </div>
        
        {showAdjustment && (
            <div className="flex justify-between text-slate-500 italic text-xs">
                <span>Fees & Adjustments</span>
                <span>{currency}{discrepancy.toFixed(2)}</span>
            </div>
        )}

        <div className="flex justify-between text-slate-600">
          <span>Tip</span>
          <span>{currency}{data.tip.toFixed(2)}</span>
        </div>

        {data.discount && (
             <div className="flex justify-between text-emerald-600 font-medium">
                <span>Discount ({data.discount.type === 'percentage' ? `${data.discount.value}%` : 'Fixed'})</span>
                <span>
                    -{currency}
                    {data.discount.type === 'percentage' 
                        ? (data.total * (data.discount.value / 100)).toFixed(2) 
                        : data.discount.value.toFixed(2)}
                </span>
            </div>
        )}

        <div className="flex justify-between font-bold text-lg text-slate-900 border-t border-slate-200 pt-3 mt-2">
          <span>Total</span>
          <span>{currency}{displayTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default ReceiptView;