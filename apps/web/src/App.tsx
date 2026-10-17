import { useEffect, useMemo, useState, type FC } from "react";
import "./index.css";
import type { ApiRequestError } from "./api";
import { fetchCopy, fetchRun, resetDemo } from "./api";
import type { CopyBundle, DecisionView, RunResult } from "./types";
import { SafetyBanner } from "./components/SafetyBanner";
import { Sidebar } from "./components/Sidebar";
import { UploadModal } from "./components/UploadModal";
import { AppHeader } from "./components/AppHeader";
import { KpiGrid } from "./components/KpiGrid";
import { Dashboard } from "./components/Dashboard";
import { DetailPanel } from "./components/DetailPanel";
import { Toast } from "./components/Toast";

const App: FC = () => {
  const [run, setRun] = useState<RunResult | null>(null);
  const [copy, setCopy] = useState<CopyBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "PAY" | "ESCALATE" | "BLOCK">("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [copyData, runData] = await Promise.all([fetchCopy(), fetchRun()]);
        setCopy(copyData);
        setRun(runData);
        setSelectedId(runData.decisions[0]?.invoiceId ?? null);
      } catch (e) {
        setError(e as ApiRequestError);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = useMemo(() => {
    if (!selectedId || !run) return null;
    return run.decisions.find((d) => d.invoiceId === selectedId) ?? null;
  }, [selectedId, run]);

  const categories = useMemo(() => {
    const values = (run?.decisions ?? []).map((d) => d.budgetCategory);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [run]);

  const handleChanged = (next: DecisionView) => {
    if (!run) return;
    const nextRun: RunResult = {
      ...run,
      decisions: run.decisions.map((d) => (d.invoiceId === next.invoiceId ? { ...next } : d))
    };
    setRun(nextRun);
    setSelectedId(next.invoiceId);
  };

  const handleSuccess = (msg: string) => {
    setToast({ type: "success", message: msg });
    setTimeout(() => setToast(null), 3200);
  };

  const handleError = (err: ApiRequestError) => {
    setError(err);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Cargando Agente Pagador...
      </div>
    );
  }

  if (!copy || !run) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-block">
        No fue posible cargar la información de la demostración.
      </div>
    );
  }

  const ui = copy.ui;

  const handleUploaded = (nextRun: RunResult, decision: DecisionView) => {
    setRun(nextRun);
    setSelectedId(decision.invoiceId);
    setActiveTab("all");
    const decisionLabel = copy.decision[decision.decision].label;
    let message = ui.ingest.success
      .replace("{id}", decision.invoiceId)
      .replace("{decision}", decisionLabel);
    if (decision.decision === "BLOCK" && decision.primaryReason === "MISSING_CRITICAL_DATA") {
      message = `${message} ${ui.ingest.imageBlocked}`;
    }
    handleSuccess(message);
  };

  const handleReset = async () => {
    try {
      const res = await resetDemo();
      setRun(res.run);
      setSelectedId(res.run.decisions[0]?.invoiceId ?? null);
      setActiveTab("all");
    } catch (e) {
      handleError(e as ApiRequestError);
    }
  };

  return (
    <div className="min-h-screen">
      <SafetyBanner title={ui.banner.title} text={ui.banner.text} short={ui.banner.short} />
      <div className="flex min-h-[calc(100vh-40px)]">
        <Sidebar
          brand={ui.header.brand}
          org={ui.header.org}
          subtitle={ui.header.subtitle}
          sectionsLabel={ui.sidebar.sectionsLabel}
          nav={ui.sidebar.nav}
          uploadButton={ui.sidebar.uploadButton}
          resetButton={ui.sidebar.resetButton}
          resetConfirm={ui.sidebar.resetConfirm}
          footer={ui.sidebar.footer}
          onUpload={() => setUploadOpen(true)}
          onReset={handleReset}
        />

        <main className="min-w-0 flex-1 space-y-6 px-6 py-6">
          <AppHeader
            run={run}
            org={ui.header.org}
            brand={ui.header.brand}
            subtitle={ui.header.subtitle}
            motto={ui.header.motto}
            policyPrefix={ui.header.policyPrefix}
            invariantBadge={ui.kpis.invariantBadge}
            invariantSupport={ui.kpis.invariantSupport}
          />
          <KpiGrid
            metrics={run.metrics}
            title={ui.kpis.title}
            descriptions={ui.kpis.descriptions}
            invariantBadge={ui.kpis.invariantBadge}
            invariantSupport={ui.kpis.invariantSupport}
            noSample={ui.kpis.noSample}
            sampleHint={ui.kpis.sampleHint}
          />
          <Dashboard
            decisions={run.decisions}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            tabs={ui.dashboard.tabs as { all: string; PAY: string; ESCALATE: string; BLOCK: string }}
            columns={ui.dashboard.columns}
            empty={ui.dashboard.empty}
            processedLabel={ui.dashboard.processedLabel}
            onSelect={(id) => setSelectedId(id)}
            selectedId={selectedId}
            decisionLabels={copy.decision}
          />
        </main>

        <aside
          id="inspector"
          className="sticky top-10 hidden h-[calc(100vh-40px)] w-96 shrink-0 scroll-mt-14 overflow-y-auto border-l border-border bg-surface xl:block"
        >
          <DetailPanel
            decision={selected}
            copy={copy}
            onClose={() => setSelectedId(null)}
            onChanged={handleChanged}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        </aside>
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        categories={categories}
        ingest={ui.ingest}
        onUploaded={handleUploaded}
      />
      <Toast
        toast={toast}
        error={error}
        onDismissToast={() => setToast(null)}
        onDismissError={() => setError(null)}
      />
    </div>
  );
};

export default App;
