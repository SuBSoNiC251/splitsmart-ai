import React, { useState, useEffect } from 'react';
import { parseReceiptImage, processChatCommand } from './services/geminiService';
import { ReceiptData, ReceiptItem, ChatMessage, AppState, PersonSummary } from './types';
import ReceiptView from './components/ReceiptView';
import ChatInterface from './components/ChatInterface';
import SummaryCard from './components/SummaryCard';
import PersonDetailModal from './components/PersonDetailModal';

// Helper to convert file to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Data State
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null); // Store Base64 for viewing
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! Upload a receipt image to get started. I will analyze it, and then you can tell me who ordered what!',
      timestamp: new Date()
    }
  ]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(null);

  // Mobile UX State
  const [mobileTab, setMobileTab] = useState<'receipt' | 'summary'>('receipt');
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);

  // Prevent scrolling on body when modal/chat is open on mobile
  useEffect(() => {
    if (isMobileChatOpen || selectedPerson || confirmModal) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
  }, [isMobileChatOpen, selectedPerson, confirmModal]);

  // --- Actions ---

  const resetApp = () => {
      setAppState(AppState.UPLOAD);
      setReceiptData(null);
      setOriginalImage(null);
      setMessages([{
        id: 'welcome',
        role: 'model',
        text: 'Hello! Upload a receipt image to get started.',
        timestamp: new Date()
      }]);
      setMobileTab('receipt');
      setShowMenu(false);
  };

  const requestReset = () => {
      setConfirmModal({
          title: "Start Over?",
          message: "Are you sure you want to clear the current receipt and start from scratch?",
          onConfirm: () => resetApp()
      });
      setShowMenu(false);
  };

  const requestClearAssignments = () => {
      setConfirmModal({
          title: "Clear Assignments?",
          message: "This will remove all person assignments. The receipt items will remain. This action cannot be undone.",
          onConfirm: () => {
            setReceiptData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    items: prev.items.map(item => ({ ...item, assignedTo: [] })),
                    fixedContributions: {},
                    discount: undefined
                };
            });
            setMessages(prev => [...prev, {
                id: `sys-${Date.now()}`,
                role: 'model',
                text: "I've cleared all assignments. You can start splitting from scratch.",
                timestamp: new Date()
            }]);
          }
      });
      setShowMenu(false);
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
        setError("Please upload an image file (JPG, PNG).");
        return;
    }

    setIsLoading(true);
    setError(null);
    setAppState(AppState.PROCESSING);

    try {
      const base64 = await fileToBase64(file);
      setOriginalImage(base64); // Save image for viewing
      const data = await parseReceiptImage(base64, file.type);
      setReceiptData(data);
      setAppState(AppState.SPLIT);
      
      setMessages(prev => [
        ...prev,
        {
          id: `parsed-${Date.now()}`,
          role: 'model',
          text: `I found ${data.items.length} items from ${data.merchantName || 'the receipt'} (${data.currencySymbol}). You can now chat with me to split the bill.`,
          timestamp: new Date()
        }
      ]);

    } catch (err) {
      console.error(err);
      setError("Failed to process the receipt. Please try another image.");
      setAppState(AppState.UPLOAD);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // --- Chat Logic ---

  const handleSendMessage = async (text: string) => {
    if (!receiptData) return;

    const newUserMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMsg]);
    setChatProcessing(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const knownPeople = Array.from(new Set(receiptData.items.flatMap(i => i.assignedTo)));

      const result = await processChatCommand(
          history, 
          receiptData.items, 
          text,
          knownPeople
      );

      const toolCalls = result.toolCalls;
      let responseText = result.text;
      let shouldReset = false;

      if (toolCalls && toolCalls.length > 0) {
        setReceiptData(prevData => {
            if(!prevData) return null;
            let newItems = [...prevData.items];
            let newTotal = prevData.total;
            let newSubtotal = prevData.subtotal;
            let newTip = prevData.tip;
            let newDiscount = prevData.discount;
            let newFixedContributions = { ...prevData.fixedContributions };
            let dataChanged = false;

            for(const call of toolCalls) {
                if (call.name === 'assign_items') {
                     const updates = call.args.assignments;
                     if (updates && Array.isArray(updates)) {
                        updates.forEach((update: any) => {
                            const { itemName, people } = update;
                            let targetIndex = newItems.findIndex(i => i.name.toLowerCase() === itemName.toLowerCase());
                            if (targetIndex === -1) {
                                targetIndex = newItems.findIndex(i => 
                                    i.name.toLowerCase().includes(itemName.toLowerCase()) || 
                                    itemName.toLowerCase().includes(i.name.toLowerCase())
                                );
                            }
                            if (targetIndex !== -1) {
                                newItems[targetIndex] = {
                                    ...newItems[targetIndex],
                                    assignedTo: people
                                };
                                dataChanged = true;
                            }
                        });
                     }
                } 
                else if (call.name === 'split_item') {
                    const { originalItemName, newItems: splitDetails } = call.args;
                    const originalIndex = newItems.findIndex(i => i.name.toLowerCase().includes(originalItemName.toLowerCase()));

                    if (originalIndex !== -1 && splitDetails && Array.isArray(splitDetails)) {
                        const originalItem = newItems[originalIndex];
                        const createdItems: ReceiptItem[] = splitDetails.map((split: any, idx: number) => ({
                            id: `${originalItem.id}-split-${idx}-${Date.now()}`,
                            name: split.name,
                            price: Number(split.price),
                            assignedTo: split.people || []
                        }));
                        
                        // Replace item
                        newItems.splice(originalIndex, 1, ...createdItems);
                        dataChanged = true;
                    }
                }
                else if (call.name === 'add_item') {
                    const { name, price, people } = call.args;
                    const priceNum = Number(price);
                    const newItem: ReceiptItem = {
                        id: `added-${Date.now()}`,
                        name: name,
                        price: priceNum,
                        assignedTo: people || []
                    };
                    newItems.push(newItem);
                    newSubtotal += priceNum;
                    newTotal += priceNum; 
                    dataChanged = true;
                }
                else if (call.name === 'apply_discount') {
                    const { type, value } = call.args;
                    newDiscount = { type, value: Number(value) };
                    dataChanged = true;
                }
                else if (call.name === 'set_fixed_contribution') {
                    const { name, amount } = call.args;
                    newFixedContributions[name] = Number(amount);
                    dataChanged = true;
                }
                else if (call.name === 'remove_fixed_contribution') {
                    const { name } = call.args;
                    if (newFixedContributions[name] !== undefined) {
                        delete newFixedContributions[name];
                        dataChanged = true;
                    } else {
                        const key = Object.keys(newFixedContributions).find(k => k.toLowerCase() === name.toLowerCase());
                        if (key) {
                            delete newFixedContributions[key];
                            dataChanged = true;
                        }
                    }
                }
                else if (call.name === 'update_tip') {
                    const { amount } = call.args;
                    const oldTip = newTip;
                    newTip = Number(amount);
                    // Adjust total by the difference in tip
                    newTotal = newTotal - oldTip + newTip;
                    dataChanged = true;
                }
                else if (call.name === 'reset_receipt') {
                    shouldReset = true;
                }
            }
            return dataChanged ? { 
                ...prevData, 
                items: newItems, 
                total: newTotal, 
                subtotal: newSubtotal,
                tip: newTip,
                discount: newDiscount,
                fixedContributions: newFixedContributions
            } : prevData;
        });
      }

      // Handle Full Reset
      if (shouldReset) {
          resetApp();
          return;
      }

      // FALLBACK
      if (!responseText && toolCalls && toolCalls.length > 0) {
        responseText = "I've updated the receipt based on your request.";
      } else if (!responseText) {
        responseText = "I'm not sure I understood. Could you try rephrasing?";
      }

      setMessages(prev => [...prev, {
        id: `model-${Date.now()}`,
        role: 'model',
        text: responseText,
        timestamp: new Date()
      }]);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'model',
        text: "I encountered an error processing your request.",
        timestamp: new Date()
      }]);
    } finally {
      setChatProcessing(false);
    }
  };

  // --- Render ---

  // UPLOAD STATE
  if (appState === AppState.UPLOAD || appState === AppState.PROCESSING) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100 relative z-10">
           <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-icons text-3xl">document_scanner</span>
           </div>
           
           <h1 className="text-3xl font-extrabold text-slate-800 mb-2">SplitSmart AI</h1>
           <p className="text-slate-500 mb-8">Upload a receipt to start splitting costs instantly using Gemini.</p>

           {error && (
             <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
               {error}
             </div>
           )}

           {isLoading ? (
             <div className="flex flex-col items-center py-8">
               <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
               <p className="text-blue-600 font-medium animate-pulse">Analyzing Receipt...</p>
             </div>
           ) : (
             <label 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all group ${
                    isDragging 
                    ? 'border-blue-500 bg-blue-50 scale-105 shadow-inner' 
                    : 'border-slate-300 hover:bg-slate-50 hover:border-blue-400'
                }`}
             >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <span className={`material-icons text-4xl mb-2 transition-colors ${isDragging ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-500'}`}>
                        {isDragging ? 'file_download' : 'cloud_upload'}
                    </span>
                    <p className="mb-1 text-sm text-slate-500 font-medium">
                        {isDragging ? 'Drop receipt here' : 'Click or Drag & Drop to upload'}
                    </p>
                    <p className="text-xs text-slate-400">JPG, PNG</p>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
             </label>
           )}
        </div>
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-blue-50 to-transparent z-0"></div>
      </div>
    );
  }

  // SPLIT VIEW
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shadow-sm z-20 shrink-0">
         <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
                <span className="material-icons text-xl block">splitscreen</span>
            </div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800">SplitSmart AI</h1>
         </div>
         <div className="relative">
            <button 
                onClick={() => setShowMenu(!showMenu)}
                className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200"
                aria-label="Options menu"
            >
                <span className="material-icons text-2xl">more_vert</span>
            </button>
            
            {showMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right z-50">
                    <button 
                        onClick={requestClearAssignments}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                    >
                        <span className="material-icons text-lg text-orange-500">group_off</span>
                        Clear Assignments
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button 
                        onClick={requestReset}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                    >
                        <span className="material-icons text-lg">restart_alt</span>
                        Reset All
                    </button>
                </div>
            )}
            
            {/* Overlay to close menu */}
            {showMenu && (
                <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowMenu(false)}
                />
            )}
         </div>
      </header>

      {/* Main Content Grid - Desktop & Mobile Logic */}
      <main className="flex-1 relative md:p-6 md:grid md:grid-cols-12 md:gap-6 max-w-[1600px] mx-auto w-full overflow-hidden">
         
         {/* Left: Receipt (Desktop: 4 cols, Mobile: Full if Tab=Receipt) */}
         <section className={`h-full flex flex-col min-h-0 md:col-span-4 bg-white md:bg-transparent ${mobileTab === 'receipt' ? 'block' : 'hidden md:flex'}`}>
            {receiptData && (
                <ReceiptView 
                    data={receiptData} 
                    originalImage={originalImage}
                    className="h-full border-0 md:border md:rounded-xl" 
                />
            )}
         </section>

         {/* Middle: Chat (Desktop: 5 cols, Mobile: Full Screen Overlay) */}
         {/* On mobile, chat is a separate layer above everything else when active */}
         <section className={`md:col-span-5 h-full flex flex-col min-h-0 z-30 
             ${isMobileChatOpen ? 'fixed inset-0 bg-slate-100 z-[60]' : 'hidden md:flex'}
         `}>
            <div className="w-full h-full flex flex-col">
                <ChatInterface 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    isProcessing={chatProcessing}
                    className="h-full shadow-none md:shadow-lg border-0 md:border rounded-none md:rounded-xl"
                    onClose={() => setIsMobileChatOpen(false)}
                />
            </div>
         </section>

         {/* Right: Summary (Desktop: 3 cols, Mobile: Full if Tab=Summary) */}
         <section className={`h-full flex flex-col min-h-0 md:col-span-3 bg-white md:bg-transparent ${mobileTab === 'summary' ? 'block' : 'hidden md:flex'}`}>
             {receiptData && (
                <SummaryCard 
                  receiptData={receiptData} 
                  className="h-full border-0 md:border md:rounded-xl"
                  onPersonSelect={setSelectedPerson} 
                />
             )}
         </section>
      </main>

      {/* Mobile Bottom Navigation & FAB */}
      <div className="md:hidden shrink-0">
          {/* Floating Action Button (FAB) for Chat */}
          <button 
            onClick={() => setIsMobileChatOpen(true)}
            className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center z-40 hover:bg-indigo-700 transition-all active:scale-95 ${isMobileChatOpen ? 'hidden' : 'flex'}`}
            aria-label="Open chat"
          >
             <span className="material-icons text-2xl">chat</span>
          </button>

          {/* Bottom Nav Bar */}
          <div className="bg-white border-t border-slate-200 flex justify-around items-center z-30 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)]">
             <button 
                onClick={() => setMobileTab('receipt')}
                className={`flex-1 py-3 flex flex-col items-center gap-1.5 touch-manipulation ${mobileTab === 'receipt' ? 'text-blue-600' : 'text-slate-400'}`}
             >
                <span className={`material-icons transition-colors ${mobileTab === 'receipt' ? 'scale-110' : ''}`}>receipt_long</span>
                <span className="text-[10px] font-semibold tracking-wide uppercase">Receipt</span>
             </button>
             <div className="w-px h-8 bg-slate-100"></div>
             <button 
                onClick={() => setMobileTab('summary')}
                className={`flex-1 py-3 flex flex-col items-center gap-1.5 touch-manipulation ${mobileTab === 'summary' ? 'text-emerald-600' : 'text-slate-400'}`}
             >
                <span className={`material-icons transition-colors ${mobileTab === 'summary' ? 'scale-110' : ''}`}>payments</span>
                <span className="text-[10px] font-semibold tracking-wide uppercase">Summary</span>
             </button>
          </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
           {/* Overlay click to cancel */}
           <div className="absolute inset-0" onClick={() => setConfirmModal(null)}></div>
           
           <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 relative z-10">
              <div className="mb-4">
                 <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                    <span className="material-icons text-indigo-600 text-2xl">help_outline</span>
                 </div>
                 <h3 className="text-lg font-bold text-slate-800">{confirmModal.title}</h3>
                 <p className="text-slate-500 mt-2 text-sm leading-relaxed">{confirmModal.message}</p>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95 text-sm"
                >
                  Confirm
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedPerson && receiptData && (
        <PersonDetailModal 
          person={selectedPerson} 
          currencySymbol={receiptData.currencySymbol}
          onClose={() => setSelectedPerson(null)} 
        />
      )}
    </div>
  );
};

export default App;