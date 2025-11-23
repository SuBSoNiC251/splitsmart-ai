import { GoogleGenAI, Type, FunctionDeclaration, Schema } from "@google/genai";
import { ReceiptData, ReceiptItem } from "../types";

// Helper to get API key safely
const getApiKey = () => process.env.API_KEY || '';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: getApiKey() });

const MODEL_NAME = 'gemini-3-pro-preview';

/**
 * Parses a receipt image to extract items, totals, and metadata.
 */
export const parseReceiptImage = async (base64Image: string, mimeType: string): Promise<ReceiptData> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      merchantName: { type: Type.STRING, description: "Name of the restaurant or store" },
      date: { type: Type.STRING, description: "Date of the transaction" },
      location: { type: Type.STRING, description: "City, State, or Country of the store" },
      currencySymbol: { type: Type.STRING, description: "Currency symbol (e.g., $, €, £, ₹)" },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            price: { type: Type.NUMBER },
          },
          required: ["name", "price"],
        },
      },
      subtotal: { type: Type.NUMBER },
      tax: { type: Type.NUMBER, description: "Sum of ALL taxes, VAT, GST, and Service Charges" },
      tip: { type: Type.NUMBER },
      total: { type: Type.NUMBER },
    },
    required: ["items", "subtotal", "total"],
  };

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: "Extract receipt data. Rules:\n1. 'tax' must include ALL surcharges (CGST, SGST, VAT, Service Charge, etc).\n2. Ensure subtotal + tax + tip is close to the Total.\n3. If currency is not visible, infer from location (e.g. India -> ₹).\n4. Clean item names.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        systemInstruction: "You are an expert receipt parser. Be mathematically precise. The 'tax' field should be the sum of all fees added to the subtotal (Tax + Service Charge).",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const rawData = JSON.parse(text);

    // Hydrate with IDs and empty assignments
    const items: ReceiptItem[] = (rawData.items || []).map((item: any, index: number) => ({
      id: `item-${index}-${Date.now()}`,
      name: item.name,
      price: Number(item.price),
      assignedTo: [],
    }));

    return {
      items,
      subtotal: Number(rawData.subtotal || 0),
      tax: Number(rawData.tax || 0),
      tip: Number(rawData.tip || 0),
      total: Number(rawData.total || 0),
      merchantName: rawData.merchantName,
      date: rawData.date,
      location: rawData.location,
      currencySymbol: rawData.currencySymbol || '$', 
    };

  } catch (error) {
    console.error("Error parsing receipt:", error);
    throw error;
  }
};

/**
 * Chat Logic with Function Calling to assign items.
 */
export const processChatCommand = async (
  history: { role: string; parts: { text: string }[] }[],
  currentItems: ReceiptItem[],
  userMessage: string,
  knownPeople: string[] = [] // List of people already in the system
): Promise<{ text: string; toolCalls?: any[] }> => {

  // Tool 1: Standard Assignment
  const assignItemTool: FunctionDeclaration = {
    name: "assign_items",
    description: "Assigns people to specific receipt items.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        assignments: {
          type: Type.ARRAY,
          description: "List of assignments to apply.",
          items: {
            type: Type.OBJECT,
            properties: {
              itemName: {
                type: Type.STRING,
                description: "The EXACT name of the item on the receipt as listed in context.",
              },
              people: {
                type: Type.ARRAY,
                description: "List of names of people sharing this item. If empty, it clears the assignment.",
                items: { type: Type.STRING },
              },
            },
            required: ["itemName", "people"],
          },
        },
      },
      required: ["assignments"],
    },
  };

  // Tool 2: Split Item by Quantity
  const splitItemTool: FunctionDeclaration = {
    name: "split_item",
    description: "Splits one receipt item into multiple smaller items. Use when users share specific quantities OR percentages (calculate the price yourself).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        originalItemName: { type: Type.STRING, description: "The name of the item to split found in the context list." },
        newItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "New name (e.g. '3 Vanilla Milkshakes' or 'Pizza (70% share)')" },
              price: { type: Type.NUMBER, description: "Price for this portion." },
              people: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["name", "price", "people"]
          }
        }
      },
      required: ["originalItemName", "newItems"]
    }
  };

  // Tool 3: Add New Item (Manual addition)
  const addItemTool: FunctionDeclaration = {
    name: "add_item",
    description: "Adds a missing item or an extra charge to the bill. Also supports negative prices for credits/adjustments.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the item" },
        price: { type: Type.NUMBER, description: "Price of the item (negative for credit)" },
        people: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Who this item is assigned to (optional)" }
      },
      required: ["name", "price"]
    }
  };

  // Tool 4: Apply Discount
  const applyDiscountTool: FunctionDeclaration = {
    name: "apply_discount",
    description: "Applies a discount to the entire bill.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["percentage", "fixed"], description: "Type of discount" },
        value: { type: Type.NUMBER, description: "The percentage (e.g., 20 for 20%) or the fixed amount." }
      },
      required: ["type", "value"]
    }
  };

  // Tool 5: Set Fixed Contribution
  const setFixedContributionTool: FunctionDeclaration = {
    name: "set_fixed_contribution",
    description: "Sets a specific person to pay a FIXED amount total. The remaining bill is split among others.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the person" },
        amount: { type: Type.NUMBER, description: "The fixed amount they will pay" }
      },
      required: ["name", "amount"]
    }
  };

  // Tool 6: Remove Fixed Contribution
  const removeFixedContributionTool: FunctionDeclaration = {
    name: "remove_fixed_contribution",
    description: "Removes a fixed contribution rule for a person, reverting them to normal shared splitting.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the person" }
      },
      required: ["name"]
    }
  };

  // Tool 7: Update Tip
  const updateTipTool: FunctionDeclaration = {
    name: "update_tip",
    description: "Updates the tip amount on the bill.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            amount: { type: Type.NUMBER, description: "The new absolute tip amount." }
        },
        required: ["amount"]
    }
  };

  // Tool 8: Reset Receipt
  const resetReceiptTool: FunctionDeclaration = {
      name: "reset_receipt",
      description: "Resets the entire application state to the start (upload screen). Use when user says 'Reset everything' or 'Start over'.",
      parameters: { type: Type.OBJECT, properties: {}, required: [] }
  };

  // Convert current items to a string list for context
  const itemsContext = currentItems
    .map((item) => `- ${item.name} (${item.price.toFixed(2)}) [Currently Assigned: ${item.assignedTo.join(', ') || 'Nobody'}]`)
    .join('\n');

  const peopleContext = knownPeople.length > 0 
    ? `KNOWN PEOPLE: ${knownPeople.join(', ')}` 
    : "KNOWN PEOPLE: None yet.";

  const systemInstruction = `
    You are SplitSmart AI, an advanced bill-splitting assistant.
    
    CURRENT RECEIPT ITEMS:
    ${itemsContext}

    ${peopleContext}

    CRITICAL RULES:
    1. **Show Your Work:** Never provide a final number for a complex calculation (like a proportional split) without first showing the step-by-step math in your text response.
    2. **Logic & Math Validation:**
       - **Impossible Splits:** If a user requests a percentage split (e.g., "50% to A, 50% to B, 20% to C"), YOU MUST verify it sums to 100%. If it equals 120%, REJECT the request and explain the error to the user in text. Do not call a tool.
       - **Unequal/Percentage Splits:** If user says "Split Pizza 70/30", YOU must calculate the prices manually (e.g. Price * 0.7, Price * 0.3) and use the 'split_item' tool to create "Pizza (70%)" and "Pizza (30%)" items.
       - **Negative Items:** If user adds a negative amount (e.g. "Add a Bad Service Comp of -100"), use 'add_item' with a negative price value.
    
    3. **Tool Usage:** 
       - Use 'assign_items' to map people to items.
       - Use 'split_item' if splitting a quantity OR percentage (you calculate the split prices).
       - Use 'add_item' if the user mentions an item not on the list.
       - Use 'update_tip' if the user specifically changes the tip amount.
       - Use 'apply_discount' for bill-wide discounts.
       - Use 'set_fixed_contribution' if someone pays a fixed amount (e.g. "Ben pays 1000").
       - Use 'remove_fixed_contribution' if the user wants to undo a fixed payment rule.
       - Use 'reset_receipt' if the user wants to clear everything and start over.

    4. **Text Response Required:** ALWAYS provide a helpful text response summarizing what you did, even when calling a tool. Say "I've added the discount..." or "I've updated the split...".
    
    SCENARIO HANDLING:
    - If user says "Ben pays 1000, split the rest proportionally", call 'set_fixed_contribution' for Ben. The App Logic handles the math, but YOU must explain the logic in text so the user trusts it.
    - If user says "Ben is no longer paying fixed", call 'remove_fixed_contribution'.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        ...history.map(h => ({ role: h.role, parts: h.parts })), // Previous history
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        tools: [{ functionDeclarations: [
            assignItemTool, 
            splitItemTool, 
            addItemTool, 
            applyDiscountTool, 
            setFixedContributionTool, 
            removeFixedContributionTool,
            updateTipTool,
            resetReceiptTool
        ]}],
        systemInstruction: systemInstruction,
      },
    });

    // Check for tool calls
    const functionCalls = response.functionCalls;
    const text = response.text || "";

    return { text, toolCalls: functionCalls };

  } catch (error) {
    console.error("Chat error:", error);
    return { text: "Sorry, I had trouble processing that request.", toolCalls: undefined };
  }
};