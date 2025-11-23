import React, { useMemo, useState } from 'react';
import { ReceiptData, PersonSummary } from '../types';

interface SummaryCardProps {
  receiptData: ReceiptData;
  className?: string;
  onPersonSelect?: (person: PersonSummary) => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ receiptData, className, onPersonSelect }) => {
  const currency = receiptData.currencySymbol || '$';
  const [copied, setCopied] = useState(false);
  
  const summary: PersonSummary[] = useMemo(() => {
    // Phase 1: Calculate "Raw" Share for everyone (Base items + proportional tax/tip)
    // This represents what they WOULD owe if there were no discounts or fixed arrangements.
    
    const peopleMap = new Map<string, PersonSummary>();
    const tempPeopleMap = new Map<string, { rawSubtotal: number, rawTotal: number, items: any[] }>();

    // 1a. Items
    receiptData.items.forEach(item => {
      if (item.assignedTo.length > 0) {
        const splitCount = item.assignedTo.length;
        const pricePerPerson = item.price / splitCount;

        item.assignedTo.forEach(personName => {
          if (!tempPeopleMap.has(personName)) {
            tempPeopleMap.set(personName, { rawSubtotal: 0, rawTotal: 0, items: [] });
          }
          const person = tempPeopleMap.get(personName)!;
          person.items.push(item);
          person.rawSubtotal += pricePerPerson;
        });
      }
    });

    // 1b. Tax & Tip (Proportional to subtotal)
    const subtotal = receiptData.subtotal || 1; 
    const tipAmount = receiptData.tip || 0;
    const rawTaxGap = receiptData.total - receiptData.subtotal - tipAmount;
    const distributableTax = Math.max(0, rawTaxGap); 
    
    const taxRatio = distributableTax / subtotal;
    const tipRatio = tipAmount / subtotal;

    let totalRawShare = 0;

    tempPeopleMap.forEach((data, name) => {
        const taxShare = data.rawSubtotal * taxRatio;
        const tipShare = data.rawSubtotal * tipRatio;
        const rawTotal = data.rawSubtotal + taxShare + tipShare;
        
        data.rawTotal = rawTotal;
        totalRawShare += rawTotal;
        
        peopleMap.set(name, {
            name: name,
            items: data.items,
            subtotalOwed: data.rawSubtotal,
            taxOwed: taxShare,
            tipOwed: tipShare,
            totalOwed: rawTotal // Initial value, will be overridden below
        });
    });

    // Phase 2: Apply Discount to get Net Bill
    let netBill = receiptData.total;
    if (receiptData.discount) {
        if (receiptData.discount.type === 'percentage') {
            netBill = receiptData.total * (1 - receiptData.discount.value / 100);
        } else {
            netBill = Math.max(0, receiptData.total - receiptData.discount.value);
        }
    }

    // Phase 3: Handle Fixed Contributions
    // Logic: 
    // Remaining Bill = Net Bill - Sum(Fixed Amounts)
    // Remaining Bill is distributed to Non-Fixed people based on their Weight.
    // Weight = Their Raw Share / Sum(Raw Shares of Non-Fixed People)

    const fixedContribs = receiptData.fixedContributions || {};
    let fixedTotal = 0;
    let nonFixedRawTotal = 0;
    const fixedPeople = new Set(Object.keys(fixedContribs));

    // Calculate totals for fixed vs variable groups
    peopleMap.forEach((person, name) => {
        if (fixedPeople.has(name)) {
            fixedTotal += fixedContribs[name];
        } else {
            nonFixedRawTotal += person.totalOwed; // Using the Raw Total as weight
        }
    });

    const remainingBillToSplit = Math.max(0, netBill - fixedTotal);

    // Phase 4: Final Distribution
    return Array.from(peopleMap.values()).map(person => {
        let finalAmount = 0;
        let isFixed = false;

        if (fixedPeople.has(person.name)) {
            finalAmount = fixedContribs[person.name];
            isFixed = true;
        } else {
            // Variable person
            if (nonFixedRawTotal > 0) {
                const weight = person.totalOwed / nonFixedRawTotal;
                finalAmount = weight * remainingBillToSplit;
            } else {
                finalAmount = 0; // Should not happen unless bill is 0
            }
        }

        return {
            ...person,
            totalOwed: finalAmount,
            isFixed
        };
    }).sort((a, b) => b.totalOwed - a.totalOwed);

  }, [receiptData]);

  const unassignedTotal = useMemo(() => {
      return receiptData.items
        .filter(i => i.assignedTo.length === 0)
        .reduce((sum, i) => sum + i.price, 0);
  }, [receiptData]);

  const handleExport = () => {
    const header = `🧾 SplitSmart Summary for ${receiptData.merchantName || 'Bill'}\n`;
    let body = summary.map(p => {
        return `${p.name}: ${currency}${p.totalOwed.toFixed(2)} (${p.items.length} items)`;
    }).join('\n');

    if (unassignedTotal > 0.01) {
        body += `\n⚠️ Unassigned: ${currency}${unassignedTotal.toFixed(2)} + tax/tip`;
    }
    
    // Add discount note to export
    let footer = `\n\nTotal: ${currency}${receiptData.total.toFixed(2)}`;
    if (receiptData.discount) {
        const dVal = receiptData.discount.value;
        const dTxt = receiptData.discount.type === 'percentage' ? `${dVal}%` : `${currency}${dVal}`;
        footer += ` (After ${dTxt} discount)`;
    }
    
    const fullText = header + body + footer;
    
    navigator.clipboard.writeText(fullText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    });
  };

  // Calculate Net Bill for display
  let displayTotal = receiptData.total;
  if (receiptData.discount) {
     if (receiptData.discount.type === 'percentage') {
         displayTotal = receiptData.total * (1 - receiptData.discount.value / 100);
     } else {
         displayTotal = Math.max(0, receiptData.total - receiptData.discount.value);
     }
  }

  return (
    <div className={`bg-white md:rounded-xl shadow-none md:shadow-lg border-0 md:border border-slate-200 flex flex-col ${className}`}>
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0 sticky top-0 z-10">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span className="material-icons text-emerald-600">payments</span>
          Split Summary
        </h2>
        
        <button 
            onClick={handleExport}
            className="text-slate-600 hover:text-emerald-600 transition-colors flex items-center gap-1.5 text-xs font-bold bg-white border border-slate-300 px-3 py-2 rounded-lg shadow-sm hover:shadow active:scale-95 touch-manipulation"
            title="Copy summary to clipboard"
        >
            <span className="material-icons text-[18px]">{copied ? 'check' : 'ios_share'}</span>
            {copied ? 'Copied!' : 'Export'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-20 md:pb-3 bg-slate-50/30">
        {summary.length === 0 && unassignedTotal === 0 ? (
          <div className="text-center text-slate-400 py-12 text-sm flex flex-col items-center">
            <span className="material-icons text-4xl mb-2 text-slate-300">group_add</span>
            <p>No items assigned yet.</p>
            <p className="text-xs mt-1">Use the chat to assign costs.</p>
          </div>
        ) : (
          <div className="space-y-3">
             {unassignedTotal > 0.01 && (
                <div className="mx-1 p-3.5 bg-orange-50 border border-orange-200 rounded-xl flex justify-between items-center shadow-sm">
                    <span className="text-orange-800 text-sm font-bold flex items-center gap-2">
                        <span className="material-icons text-[18px]">warning</span>
                        Unassigned
                    </span>
                    <span className="font-bold text-orange-900">
                        {currency}{unassignedTotal.toFixed(2)} <span className="text-[10px] opacity-70 font-normal">+tax</span>
                    </span>
                </div>
             )}

            {summary.map((person) => (
              <div 
                key={person.name} 
                onClick={() => onPersonSelect?.(person)}
                className="mx-1 p-4 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer group active:scale-[0.99] touch-manipulation"
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                          {person.name.charAt(0).toUpperCase()}
                      </div>
                      <h3 className="font-bold text-slate-800 text-lg group-hover:text-emerald-800 flex flex-col leading-none">
                          {person.name}
                          {person.isFixed && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-1 self-start border border-slate-200 tracking-wide">FIXED AMOUNT</span>}
                      </h3>
                  </div>
                  <div className="flex items-center gap-1">
                      <span className="text-emerald-600 font-extrabold text-xl tracking-tight">
                        {currency}{person.totalOwed.toFixed(2)}
                      </span>
                      <span className="material-icons text-slate-300 text-xl group-hover:text-emerald-400">chevron_right</span>
                  </div>
                </div>
                
                <div className="text-xs text-slate-500 flex justify-between items-center pl-11">
                    <span>{person.items.length} items</span>
                    <span className="opacity-75">Base: {currency}{person.subtotalOwed.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
       <div className="p-4 bg-white border-t border-slate-200 text-xs text-center text-slate-500 flex flex-col gap-1 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] shrink-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-4">
           {receiptData.discount && (
               <span className="text-emerald-600 font-bold bg-emerald-50 py-1 px-2 rounded-full self-center">
                   Includes {receiptData.discount.type === 'percentage' ? `${receiptData.discount.value}%` : `${currency}${receiptData.discount.value}`} discount
               </span>
           )}
           <span className="font-medium text-slate-900 text-sm mt-1">Net Total: {currency}{displayTotal.toFixed(2)}</span>
       </div>
    </div>
  );
};

export default SummaryCard;