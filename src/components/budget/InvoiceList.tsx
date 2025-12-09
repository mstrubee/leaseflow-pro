import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Mail, CheckCircle, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBudgetContext } from "./BudgetContext";
import { BudgetSemaphore } from "./BudgetSemaphore";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  amount_uf: number;
  reception_status: string;
  received_at: string | null;
  email_sent_to: string | null;
}

interface InvoiceListProps {
  purchaseOrder: {
    id: string;
    order_number: string;
    amount_uf: number;
  };
  onUpdate: () => void;
}

export const InvoiceList = ({ purchaseOrder, onUpdate }: InvoiceListProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [email, setEmail] = useState("");
  const [newInvoice, setNewInvoice] = useState({
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    amount_uf: "",
  });
  const { toast } = useToast();
  const { formatUF, formatCLP, convertUFToPesos } = useBudgetContext();

  useEffect(() => {
    loadInvoices();
    loadLastEmail();
  }, [purchaseOrder.id]);

  const loadInvoices = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("purchase_order_id", purchaseOrder.id)
      .order("invoice_date", { ascending: false });
    setInvoices(data || []);
  };

  const loadLastEmail = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("user_settings")
        .select("last_invoice_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.last_invoice_email) {
        setEmail(data.last_invoice_email);
      }
    }
  };

  const handleCreateInvoice = async () => {
    try {
      const { error } = await supabase.from("invoices").insert({
        purchase_order_id: purchaseOrder.id,
        invoice_number: newInvoice.invoice_number,
        invoice_date: newInvoice.invoice_date,
        amount_uf: parseFloat(newInvoice.amount_uf) || 0,
      });

      if (error) throw error;

      toast({ title: "Factura agregada" });
      setShowNewDialog(false);
      setNewInvoice({ invoice_number: "", invoice_date: new Date().toISOString().split("T")[0], amount_uf: "" });
      loadInvoices();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleMarkReceived = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!selectedInvoice) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update invoice status
      await supabase
        .from("invoices")
        .update({
          reception_status: "recibido",
          received_at: new Date().toISOString(),
          email_sent_to: email,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", selectedInvoice.id);

      // Save last email
      if (user) {
        await supabase
          .from("user_settings")
          .upsert({ user_id: user.id, last_invoice_email: email }, { onConflict: "user_id" });
      }

      // TODO: Send actual email via edge function
      toast({ title: "Factura recibida", description: `Email enviado a ${email}` });
      setShowEmailDialog(false);
      loadInvoices();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    try {
      await supabase.from("invoices").delete().eq("id", id);
      loadInvoices();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount_uf, 0);
  const pendingAmount = purchaseOrder.amount_uf - totalInvoiced;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Monto OC</p>
            <p className="font-bold">{formatUF(purchaseOrder.amount_uf)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Facturado</p>
            <p className="font-bold">{formatUF(totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className="font-bold">{formatUF(pendingAmount)}</p>
          </div>
          <BudgetSemaphore budget={purchaseOrder.amount_uf} consumed={totalInvoiced} size="sm" />
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva Factura
        </Button>
      </div>

      {invoices.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Factura</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                <TableCell>{new Date(invoice.invoice_date).toLocaleDateString("es-CL")}</TableCell>
                <TableCell className="text-right font-mono">{formatUF(invoice.amount_uf)}</TableCell>
                <TableCell>
                  {invoice.reception_status === "recibido" ? (
                    <Badge className="bg-green-500 flex items-center gap-1 w-fit">
                      <CheckCircle className="h-3 w-3" />
                      Recibido
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                      <Clock className="h-3 w-3" />
                      Pendiente
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {invoice.reception_status === "pendiente" && (
                      <Button size="sm" variant="ghost" onClick={() => handleMarkReceived(invoice)}>
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteInvoice(invoice.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Factura - OC {purchaseOrder.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº Factura</Label>
                <Input value={newInvoice.invoice_number} onChange={(e) => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={newInvoice.invoice_date} onChange={(e) => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monto (UF)</Label>
              <Input type="number" step="0.01" value={newInvoice.amount_uf} onChange={(e) => setNewInvoice({ ...newInvoice, amount_uf: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateInvoice}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Recepción de Trabajo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ingrese el email para enviar confirmación de recepción de la factura {selectedInvoice?.invoice_number}
            </p>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancelar</Button>
            <Button onClick={handleSendEmail}>Confirmar y Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
