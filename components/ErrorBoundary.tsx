import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] flex items-center justify-center p-4 font-mono">
            <div className="w-full max-w-2xl border border-[#2A2A2A] bg-[#141414] shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] p-8 relative">
                 {/* Decorative Screws */}
                <div className="absolute top-2 left-2 w-2 h-2 rounded-full border border-[#707070] opacity-50 flex items-center justify-center"><div className="w-1.5 h-[1px] bg-[#707070] rotate-45"></div></div>
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full border border-[#707070] opacity-50 flex items-center justify-center"><div className="w-1.5 h-[1px] bg-[#707070] rotate-45"></div></div>
                <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full border border-[#707070] opacity-50 flex items-center justify-center"><div className="w-1.5 h-[1px] bg-[#707070] rotate-45"></div></div>
                <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full border border-[#707070] opacity-50 flex items-center justify-center"><div className="w-1.5 h-[1px] bg-[#707070] rotate-45"></div></div>

                <div className="border-b border-[#2A2A2A] pb-4 mb-6">
                    <h1 className="text-xl font-bold tracking-tight text-braun-orange uppercase">Critical System Failure</h1>
                    <p className="text-[10px] tracking-widest text-[#707070] mt-1">ERR_CODE: UNRECOVERABLE_EXCEPTION</p>
                </div>

                <div className="bg-black border border-[#333] p-4 mb-6 font-mono text-xs text-braun-orange/80 overflow-auto max-h-48">
                    <p>{this.state.error?.message || 'Unknown Error'}</p>
                    <p className="mt-2 opacity-50"> Stack trace suppressed for security.</p>
                </div>

                <button 
                    onClick={this.handleReset}
                    className="w-full h-12 bg-[#222] border border-[#444] hover:border-braun-orange hover:text-braun-orange text-[#999] font-bold text-xs uppercase tracking-widest transition-all"
                >
                    Initiate System Reboot
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;