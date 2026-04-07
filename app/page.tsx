"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  History,
  Trash2,
  Download,
  Wrench,
} from "lucide-react";

export default function DataCleanApp() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [comparison, setComparison] = useState<any>(null);
  const [cleanedCsv, setCleanedCsv] = useState("");
  const [aiReport, setAiReport] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("dataclean_last_result");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setComparison(parsed.comparison);
        setCleanedCsv(parsed.cleanedCsv);
        setAiReport(parsed.aiReport);
      } catch (e) {
        console.error("Local storage parse error", e);
      }
    }
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("http://localhost:8000/history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const onClean = () => {
    if (!file) return;
    setLoading(true);
    setProgress(0);
    setProgressStep("Connecting...");
    setError("");
    setComparison(null);
    setCleanedCsv("");
    setAiReport("");

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64full = e.target?.result as string;
      const base64Data = base64full.split(",")[1];

      const ws = new WebSocket("ws://localhost:8000/ws/clean");

      ws.onopen = () => {
        ws.send(JSON.stringify({ filename: file.name, data: base64Data }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          setLoading(false);
          ws.close();
          return;
        }

        if (data.progress !== undefined) {
          setProgress(data.progress);
          setProgressStep(data.step);
        }

        if (data.step === "Complete") {
          setComparison(data.comparison);
          setCleanedCsv(data.cleaned_csv);
          setAiReport(data.ai_report);
          localStorage.setItem(
            "dataclean_last_result",
            JSON.stringify({
              comparison: data.comparison,
              cleanedCsv: data.cleaned_csv,
              aiReport: data.ai_report,
            })
          );
          setLoading(false);
          fetchHistory();
          ws.close();
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection failed. Make sure the API is running.");
        setLoading(false);
      };
    };
    reader.readAsDataURL(file);
  };

  const downloadCsv = () => {
    if (!cleanedCsv) return;
    const blob = new Blob([atob(cleanedCsv)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const saveName = file ? `cleaned_${file.name}` : "cleaned_data.csv";
    link.setAttribute("download", saveName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const missingData = [];
  if (comparison?.missing_before) {
    for (const [col, val] of Object.entries(comparison.missing_before)) {
      const bVal = val as number;
      if (bVal > 0) {
        missingData.push({
          name: col,
          before: bVal,
          after: comparison.missing_after?.[col] ?? 0,
        });
      }
    }
  }

  const outliersData = [];
  if (comparison?.outliers_capped) {
    for (const [col, val] of Object.entries(comparison.outliers_capped)) {
      outliersData.push({ name: col, capped: val as number });
    }
  }

  let totalMissingFixed = 0;
  if (comparison?.missing_before) {
    totalMissingFixed = Object.values(comparison.missing_before).reduce(
      (a: any, b: any) => a + Number(b),
      0
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white selection:bg-[#3b82f6] selection:text-white font-sans">
      {/* HISTORY SIDEBAR */}
      <div className="w-64 bg-[#111] border-r border-gray-800 h-screen sticky top-0 overflow-y-auto p-5 hidden md:flex flex-col">
        <div className="flex items-center gap-2 text-white font-bold mb-6 text-lg">
          <History className="w-5 h-5 text-[#3b82f6]" /> History
        </div>
        <div className="space-y-4 flex-1">
          {history.length === 0 ? (
            <p className="text-gray-500 text-sm">No past sessions yet</p>
          ) : (
            history.map((h, i) => (
              <div
                key={h.session_id || i}
                className="text-sm pb-3 border-b border-gray-800/50 last:border-0"
              >
                <p
                  className="text-gray-300 font-medium truncate mb-1"
                  title={h.file_name}
                >
                  {h.file_name}
                </p>
                <p className="text-gray-600 text-xs">
                  {new Date(h.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-x-hidden p-6 md:p-10">
        <div className="max-w-5xl mx-auto">
          {/* HEADER */}
          <div className="text-center mb-12 mt-4 md:mt-10">
            <div className="inline-block px-4 py-1.5 rounded-full bg-[#111] border border-gray-800 text-xs font-medium text-gray-400 mb-6 tracking-wide">
              Open Source • Free Forever
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-5 tracking-tight">
              DataClean
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-3 font-medium">
              Upload any messy CSV. Download a clean one.
            </p>
            <p className="text-base text-gray-500">
              Auto-fixes missing values, duplicates, outliers, and inconsistent
              text.
            </p>
          </div>

          {/* UPLOAD SECTION */}
          <div className="max-w-3xl mx-auto bg-[#111] rounded-2xl border border-gray-800 p-8 md:p-10 text-center mb-12 shadow-xl shadow-black/50">
            <div
              className={`border-2 border-dashed rounded-xl p-12 mb-8 transition-colors relative flex flex-col items-center justify-center
                ${
                  file
                    ? "border-[#3b82f6] bg-[#3b82f6]/5"
                    : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/20"
                }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileChange}
              />
              <UploadCloud
                className={`w-14 h-14 mx-auto mb-4 ${
                  file ? "text-[#3b82f6]" : "text-gray-500"
                }`}
              />
              {file ? (
                <div>
                  <p className="text-white font-medium text-lg mb-1">
                    {file.name}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <p className="text-gray-400 text-lg font-medium">
                  Drop your CSV here or click to browse
                </p>
              )}
            </div>

            <button
              onClick={onClean}
              disabled={!file || loading}
              className={`w-full md:w-auto px-10 py-4 rounded-xl font-bold text-lg transition-all ${
                !file || loading
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-[#3b82f6] text-white hover:bg-blue-600 shadow-lg shadow-blue-900/50 hover:shadow-blue-900/80 hover:-translate-y-0.5"
              }`}
            >
              Clean Data
            </button>
          </div>

          {/* PROGRESS SECTION */}
          {loading && (
            <div className="max-w-3xl mx-auto mb-12">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-[#3b82f6] font-medium animate-pulse">
                  {progressStep}
                </span>
                <span className="text-gray-400 font-medium">{progress}%</span>
              </div>
              <div className="w-full bg-[#111] rounded-full h-3 border border-gray-800 overflow-hidden">
                <div
                  className="bg-[#3b82f6] h-full rounded-full transition-all duration-300 relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="max-w-3xl mx-auto bg-red-500/10 border border-red-500/30 text-red-400 p-5 rounded-xl mb-12 flex items-start gap-3">
              <div className="p-1 bg-red-500/20 rounded shrink-0">
                <Wrench className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h4 className="font-bold text-red-500 mb-1">Error</h4>
                <p className="text-sm leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {comparison && !loading && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 space-y-8">
              {/* SECTION A - Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <StatCard
                  title="Rows Before"
                  value={comparison.rows_before}
                  icon={<FileSpreadsheet className="w-5 h-5 text-purple-400" />}
                />
                <StatCard
                  title="Rows After"
                  value={comparison.rows_after}
                  icon={<CheckCircle2 className="w-5 h-5 text-green-400" />}
                />
                <StatCard
                  title="Duplicates Removed"
                  value={comparison.duplicates_removed}
                  icon={<Trash2 className="w-5 h-5 text-red-400" />}
                />
                <StatCard
                  title="Missing Fixed"
                  value={totalMissingFixed}
                  icon={<Wrench className="w-5 h-5 text-orange-400" />}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* SECTION B - Missing Values Chart */}
                {missingData.length > 0 && (
                  <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 md:p-8">
                    <h3 className="text-xl font-bold text-white mb-6">
                      Missing Values — Before vs After
                    </h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={missingData}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                          <XAxis
                            dataKey="name"
                            stroke="#666"
                            tick={{ fill: "#888", fontSize: 12 }}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#666"
                            tick={{ fill: "#888", fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#111",
                              borderColor: "#333",
                              borderRadius: "8px",
                              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                            }}
                            itemStyle={{ fontWeight: "bold" }}
                          />
                          <Legend wrapperStyle={{ paddingTop: "20px" }} />
                          <Bar
                            dataKey="before"
                            name="Before"
                            fill="#ef4444"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                          />
                          <Bar
                            dataKey="after"
                            name="After"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* SECTION C - Outliers Capped Chart */}
                {outliersData.length > 0 && (
                  <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 md:p-8">
                    <h3 className="text-xl font-bold text-white mb-6">
                      Outliers Capped by Column
                    </h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={outliersData}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                          <XAxis
                            dataKey="name"
                            stroke="#666"
                            tick={{ fill: "#888", fontSize: 12 }}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#666"
                            tick={{ fill: "#888", fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: "#222" }}
                            contentStyle={{
                              backgroundColor: "#111",
                              borderColor: "#333",
                              borderRadius: "8px",
                              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                            }}
                          />
                          <Bar
                            dataKey="capped"
                            name="Outliers Capped"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION D - Changes Made List */}
              <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 md:p-8">
                <h3 className="text-xl font-bold text-white mb-6">
                  Log of Changes Applied
                </h3>
                <ul className="space-y-3">
                  {comparison.duplicates_removed > 0 && (
                    <li className="flex items-start gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800/50">
                      <Trash2 className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                      <span className="text-gray-300">
                        <strong className="text-white">
                          Removed {comparison.duplicates_removed}
                        </strong>{" "}
                        duplicate rows.
                      </span>
                    </li>
                  )}

                  {Object.entries(comparison.missing_before).map(
                    ([col, val]) => {
                      if ((val as number) > 0) {
                        return (
                          <li
                            key={`missing-${col}`}
                            className="flex items-start gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800/50"
                          >
                            <Wrench className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                            <span className="text-gray-300">
                              Fixed{" "}
                              <strong className="text-white">
                                {val as number}
                              </strong>{" "}
                              missing value(s) in <code className="px-1.5 py-0.5 bg-[#222] rounded text-blue-300 text-sm">{col}</code>. (Imputed with median/mode)
                            </span>
                          </li>
                        );
                      }
                      return null;
                    }
                  )}

                  {Object.entries(comparison.outliers_capped || {}).map(
                    ([col, val]) => {
                      return (
                        <li
                          key={`outlier-${col}`}
                          className="flex items-start gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800/50"
                        >
                          <CheckCircle2 className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                          <span className="text-gray-300">
                            Capped{" "}
                            <strong className="text-white">
                              {val as number}
                            </strong>{" "}
                            outlier(s) in <code className="px-1.5 py-0.5 bg-[#222] rounded text-blue-300 text-sm">{col}</code> using IQR limits.
                          </span>
                        </li>
                      );
                    }
                  )}

                  {comparison.text_cleaned &&
                    comparison.text_cleaned.length > 0 && (
                      <li className="flex items-start gap-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800/50">
                        <FileSpreadsheet className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                        <span className="text-gray-300">
                          Standardized text (lowercase + strip whitespace) for columns:{" "}
                          <span className="text-blue-300 text-sm leading-relaxed">
                            {comparison.text_cleaned.map((c: string) => <code key={c} className="px-1.5 py-0.5 bg-[#222] rounded mx-0.5">{c}</code>)}
                          </span>
                        </span>
                      </li>
                    )}
                </ul>
              </div>

              {/* SECTION E - AI Report */}
              {aiReport && (
                <div className="bg-[#111] border border-gray-800 border-l-4 border-l-[#3b82f6] p-6 md:p-8 rounded-xl shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                       <path d="M12 2L2 22l20 0z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-4">
                    Cleaning Report
                  </h3>
                  <p className="text-gray-300 text-lg leading-relaxed relative z-10">
                    {aiReport}
                  </p>
                </div>
              )}

              {/* SECTION F - Download button */}
              <div className="text-center pt-8">
                <button
                  onClick={downloadCsv}
                  className="inline-flex items-center justify-center gap-3 w-full md:w-auto px-12 py-5 bg-[#3b82f6] text-white rounded-xl font-bold text-xl hover:bg-blue-600 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-blue-900/30 group"
                >
                  <Download className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
                  Download Cleaned CSV
                </button>
              </div>
            </div>
          )}

          {/* FOOTER */}
          <footer className="text-center text-gray-600 text-sm py-12 border-t border-gray-900 mt-20">
            <p>Built by @avikcodes • Project 5 of 30</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-gray-800 rounded-xl p-5 md:p-6 flex flex-col justify-between">
      <div className="flex items-center gap-2 text-gray-400 text-sm font-medium mb-3">
        {icon}
        <h3>{title}</h3>
      </div>
      <p className="text-3xl md:text-4xl font-bold text-white tracking-tight">
        {value}
      </p>
    </div>
  );
}
