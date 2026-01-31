'use client';

import { useEffect, useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { respondToQuestion, respondToPermission } from '@/lib/socket';
import type { PermissionContext, AskUserQuestionInput } from '@/types';
import { HelpCircle, Send, MessageSquare, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  permission: PermissionContext;
}

export function QuestionModal({
  open,
  onOpenChange,
  sessionId,
  permission,
}: QuestionModalProps) {
  const input = permission.toolInput as AskUserQuestionInput | undefined;
  const questions = input?.questions || [];

  // Track selected answers for each question
  // For single select: string (the selected label)
  // For multi select: string[] (array of selected labels)
  const [selections, setSelections] = useState<Record<number, string | string[]>>({});

  // Initialize selections when modal opens
  useEffect(() => {
    if (open && questions.length > 0) {
      const initial: Record<number, string | string[]> = {};
      questions.forEach((q, idx) => {
        initial[idx] = q.multiSelect ? [] : '';
      });
      setSelections(initial);
    }
  }, [open, questions]);

  const handleSingleSelect = useCallback((questionIdx: number, label: string) => {
    setSelections(prev => ({
      ...prev,
      [questionIdx]: label,
    }));
  }, []);

  const handleMultiSelect = useCallback((questionIdx: number, label: string, checked: boolean) => {
    setSelections(prev => {
      const current = (prev[questionIdx] as string[]) || [];
      if (checked) {
        return { ...prev, [questionIdx]: [...current, label] };
      } else {
        return { ...prev, [questionIdx]: current.filter(l => l !== label) };
      }
    });
  }, []);

  const handleSubmit = useCallback(() => {
    // Build answers object
    const answers: Record<string, string> = {};
    questions.forEach((q, idx) => {
      const selection = selections[idx];
      if (q.multiSelect) {
        // For multi-select, join with comma
        answers[q.question] = (selection as string[]).join(', ');
      } else {
        answers[q.question] = selection as string;
      }
    });

    respondToQuestion(sessionId, permission.toolUseId, answers);
    onOpenChange(false);
  }, [sessionId, permission.toolUseId, questions, selections, onOpenChange]);

  const handleAskInTerminal = useCallback(() => {
    respondToPermission(sessionId, permission.toolUseId, 'ask');
    onOpenChange(false);
  }, [sessionId, permission.toolUseId, onOpenChange]);

  // Check if all questions have at least one selection
  const isComplete = questions.every((q, idx) => {
    const selection = selections[idx];
    if (q.multiSelect) {
      return (selection as string[])?.length > 0;
    }
    return !!selection;
  });

  // Keyboard shortcuts for option selection (1-4) when there's a single question
  useEffect(() => {
    if (!open || questions.length !== 1) return;

    const question = questions[0];
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if input is focused
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const num = parseInt(e.key);
      if (num >= 1 && num <= question.options.length) {
        e.preventDefault();
        const option = question.options[num - 1];
        if (question.multiSelect) {
          const current = (selections[0] as string[]) || [];
          const isSelected = current.includes(option.label);
          handleMultiSelect(0, option.label, !isSelected);
        } else {
          handleSingleSelect(0, option.label);
        }
      } else if (e.key === 'Enter' && isComplete) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleAskInTerminal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, questions, selections, isComplete, handleSingleSelect, handleMultiSelect, handleSubmit, handleAskInTerminal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-500" />
            <DialogTitle>Claude has a question</DialogTitle>
          </div>
          <DialogDescription>
            Please answer the following to help Claude proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {questions.map((question, qIdx) => (
            <div key={qIdx} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {question.header}
                </Badge>
                <span className="text-sm font-medium">{question.question}</span>
              </div>

              <div className="grid gap-2 pl-4">
                {question.options.map((option, oIdx) => {
                  const isSelected = question.multiSelect
                    ? ((selections[qIdx] as string[]) || []).includes(option.label)
                    : selections[qIdx] === option.label;

                  if (question.multiSelect) {
                    return (
                      <button
                        key={oIdx}
                        type="button"
                        onClick={() => handleMultiSelect(qIdx, option.label, !isSelected)}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                            : 'border-border hover:border-blue-300 hover:bg-muted/50'
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded border-2 mt-0.5 flex-shrink-0 flex items-center justify-center',
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-muted-foreground'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{option.label}</span>
                            {questions.length === 1 && (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {oIdx + 1}
                              </Badge>
                            )}
                          </div>
                          {option.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {option.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={oIdx}
                      type="button"
                      onClick={() => handleSingleSelect(qIdx, option.label)}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-border hover:border-blue-300 hover:bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0',
                          isSelected
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-muted-foreground'
                        )}
                      >
                        {isSelected && (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{option.label}</span>
                          {questions.length === 1 && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {oIdx + 1}
                            </Badge>
                          )}
                        </div>
                        {option.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {option.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <div className="text-xs text-muted-foreground mb-2 sm:mb-0 sm:mr-auto">
            {questions.length === 1
              ? 'Shortcuts: 1-4 to select, Enter to submit, Esc to ask in terminal'
              : 'Esc to ask in terminal'}
          </div>
          <Button
            variant="outline"
            onClick={handleAskInTerminal}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Ask in Terminal
          </Button>
          <Button
            variant="default"
            onClick={handleSubmit}
            disabled={!isComplete}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
