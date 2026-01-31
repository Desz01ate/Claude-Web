'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { respondToQuestion, respondToPermission } from '@/lib/socket';
import { usePermissionStore } from '@/stores/permissionStore';
import type { PermissionRequestContent, AskUserQuestionInput } from '@/types';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Send,
  MessageSquare,
  CheckCircle,
  Check,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Marker for custom text option selection
const CUSTOM_OPTION_LABEL = '__CUSTOM__';

interface QuestionCardProps {
  sessionId: string;
  content: PermissionRequestContent;
}

export function QuestionCard({ sessionId, content }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [localStatus, setLocalStatus] = useState(content.status);
  const isPending = localStatus === 'pending';
  const markAnswered = usePermissionStore((state) => state.markAnswered);

  const input = content.toolInput as AskUserQuestionInput | undefined;
  const questions = input?.questions || [];

  // Track selected answers
  const [selections, setSelections] = useState<Record<number, string | string[]>>({});
  // Track custom text inputs for each question
  const [customTexts, setCustomTexts] = useState<Record<number, string>>({});
  // Refs to custom input fields for focusing
  const customInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Track if user has submitted locally (prevents status regression from content.status sync)
  const hasSubmittedRef = useRef(false);
  // Store submitted answers for reliable display before content.answers is populated
  const submittedAnswersRef = useRef<Record<string, string> | null>(null);

  // Initialize selections
  useEffect(() => {
    if (questions.length > 0) {
      const initial: Record<number, string | string[]> = {};
      questions.forEach((q, idx) => {
        initial[idx] = q.multiSelect ? [] : '';
      });
      setSelections(initial);
    }
  }, [questions]);

  // Sync local status with prop changes, but respect local submission
  useEffect(() => {
    // Only sync if we haven't submitted locally, or if content says answered
    if (!hasSubmittedRef.current || content.status === 'answered') {
      setLocalStatus(content.status);
    }
  }, [content.status]);

  const handleSingleSelect = useCallback((questionIdx: number, label: string) => {
    setSelections((prev) => ({
      ...prev,
      [questionIdx]: label,
    }));
  }, []);

  const handleMultiSelect = useCallback(
    (questionIdx: number, label: string, checked: boolean) => {
      setSelections((prev) => {
        const current = (prev[questionIdx] as string[]) || [];
        if (checked) {
          return { ...prev, [questionIdx]: [...current, label] };
        } else {
          return { ...prev, [questionIdx]: current.filter((l) => l !== label) };
        }
      });
    },
    []
  );

  const handleCustomTextChange = useCallback((questionIdx: number, text: string) => {
    setCustomTexts(prev => ({ ...prev, [questionIdx]: text }));
    // Auto-select the custom option when user starts typing
    setSelections(prev => {
      const question = questions[questionIdx];
      if (question?.multiSelect) {
        const current = (prev[questionIdx] as string[]) || [];
        if (!current.includes(CUSTOM_OPTION_LABEL)) {
          return { ...prev, [questionIdx]: [...current, CUSTOM_OPTION_LABEL] };
        }
      } else {
        return { ...prev, [questionIdx]: CUSTOM_OPTION_LABEL };
      }
      return prev;
    });
  }, [questions]);

  const handleSubmit = useCallback(() => {
    const answers: Record<string, string> = {};
    questions.forEach((q, idx) => {
      const selection = selections[idx];
      if (q.multiSelect) {
        // For multi-select, replace custom marker with actual custom text
        const selectedItems = (selection as string[]).map(item =>
          item === CUSTOM_OPTION_LABEL ? customTexts[idx] || '' : item
        ).filter(item => item !== '');
        answers[q.question] = selectedItems.join(', ');
      } else {
        // For single-select, use custom text if custom option is selected
        if (selection === CUSTOM_OPTION_LABEL) {
          answers[q.question] = customTexts[idx] || '';
        } else {
          answers[q.question] = selection as string;
        }
      }
    });

    // Store for immediate display and prevent status regression
    submittedAnswersRef.current = answers;
    hasSubmittedRef.current = true;

    // Mark as answered in the store (persists across re-renders)
    markAnswered(sessionId, content.toolUseId, answers);
    respondToQuestion(sessionId, content.toolUseId, answers);
    setLocalStatus('answered');
  }, [sessionId, content.toolUseId, questions, selections, customTexts, markAnswered]);

  const handleAskInTerminal = useCallback(() => {
    respondToPermission(sessionId, content.toolUseId, 'ask');
    setLocalStatus('asked');
  }, [sessionId, content.toolUseId]);

  const isComplete = questions.every((q, idx) => {
    const selection = selections[idx];
    if (q.multiSelect) {
      const selected = (selection as string[]) || [];
      if (selected.length === 0) return false;
      // If custom option is selected, ensure custom text is non-empty
      if (selected.includes(CUSTOM_OPTION_LABEL)) {
        return !!(customTexts[idx]?.trim());
      }
      return true;
    }
    if (!selection) return false;
    // If custom option is selected, ensure custom text is non-empty
    if (selection === CUSTOM_OPTION_LABEL) {
      return !!(customTexts[idx]?.trim());
    }
    return true;
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (!isPending || questions.length !== 1) return;

    const question = questions[0];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const num = parseInt(e.key);
      // Options are 1 to N, custom option is N+1
      const customOptionKey = question.options.length + 1;

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
      } else if (num === customOptionKey) {
        // Select custom option and focus the input
        e.preventDefault();
        if (question.multiSelect) {
          const current = (selections[0] as string[]) || [];
          const isSelected = current.includes(CUSTOM_OPTION_LABEL);
          handleMultiSelect(0, CUSTOM_OPTION_LABEL, !isSelected);
        } else {
          handleSingleSelect(0, CUSTOM_OPTION_LABEL);
        }
        // Focus the custom input field
        setTimeout(() => {
          customInputRefs.current[0]?.focus();
        }, 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, questions, selections, handleSingleSelect, handleMultiSelect]);

  const getStatusBadge = () => {
    switch (localStatus) {
      case 'answered':
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Answered
          </Badge>
        );
      case 'asked':
        return (
          <Badge variant="secondary" className="gap-1">
            <MessageSquare className="h-3 w-3" />
            Asked in Terminal
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600">
            <HelpCircle className="h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card
      className={cn(
        'border-l-4',
        isPending
          ? 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
          : localStatus === 'answered'
          ? 'border-l-green-500'
          : 'border-l-gray-500'
      )}
    >
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle
              className={cn(
                'h-4 w-4',
                isPending ? 'text-blue-500' : 'text-muted-foreground'
              )}
            />
            <CardTitle className="text-sm">Question</CardTitle>
            {getStatusBadge()}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 p-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {questions.map((question, qIdx) => (
            <div key={qIdx} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {question.header}
                </Badge>
                <span className="text-sm font-medium">{question.question}</span>
              </div>

              {/* Read-only view for answered questions */}
              {localStatus === 'answered' ? (
                <div className="pl-4">
                  {(() => {
                    // Use content.answers (from store or history) if available,
                    // then submittedAnswersRef (just submitted), then fall back to local selections
                    const answerFromHistory = content.answers?.[question.question]
                      ?? submittedAnswersRef.current?.[question.question];

                    if (answerFromHistory !== undefined && answerFromHistory !== '') {
                      // Loaded from store or history - parse the answer string
                      if (question.multiSelect) {
                        const displayItems = answerFromHistory.split(', ').filter(item => item !== '');
                        return (
                          <div className="flex flex-wrap gap-2">
                            {displayItems.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/30"
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-sm">{item}</span>
                              </div>
                            ))}
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/30 w-fit">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-sm">{answerFromHistory}</span>
                          </div>
                        );
                      }
                    }

                    // Answered via local state (just submitted)
                    const selection = selections[qIdx];
                    if (question.multiSelect) {
                      const selectedItems = (selection as string[]) || [];
                      const displayItems = selectedItems.map(item =>
                        item === CUSTOM_OPTION_LABEL ? customTexts[qIdx] || '' : item
                      ).filter(item => item !== '');
                      if (displayItems.length > 0) {
                        return (
                          <div className="flex flex-wrap gap-2">
                            {displayItems.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/30"
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-sm">{item}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                    } else {
                      const displayValue = selection === CUSTOM_OPTION_LABEL
                        ? customTexts[qIdx] || ''
                        : (selection as string);
                      if (displayValue) {
                        return (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/30 w-fit">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-sm">{displayValue}</span>
                          </div>
                        );
                      }
                    }

                    // Fallback when answers are not available (loaded from history without stored answers)
                    return (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/30 w-fit">
                        <Check className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-sm text-muted-foreground italic">Answered</span>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Interactive options for pending questions */
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
                          onClick={() => isPending && handleMultiSelect(qIdx, option.label, !isSelected)}
                          disabled={!isPending}
                          className={cn(
                            'flex items-start gap-3 p-2 rounded-lg border text-left transition-colors',
                            !isPending && 'cursor-default opacity-70',
                            isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                              : 'border-border hover:border-blue-300'
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
                              <span className="text-sm">{option.label}</span>
                              {isPending && questions.length === 1 && (
                                <Badge variant="secondary" className="text-xs font-mono">
                                  {oIdx + 1}
                                </Badge>
                              )}
                            </div>
                            {option.description && (
                              <p className="text-xs text-muted-foreground">
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
                        onClick={() => isPending && handleSingleSelect(qIdx, option.label)}
                        disabled={!isPending}
                        className={cn(
                          'flex items-start gap-3 p-2 rounded-lg border text-left transition-colors',
                          !isPending && 'cursor-default opacity-70',
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                            : 'border-border hover:border-blue-300'
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
                            <span className="text-sm">{option.label}</span>
                            {isPending && questions.length === 1 && (
                              <Badge variant="secondary" className="text-xs font-mono">
                                {oIdx + 1}
                              </Badge>
                            )}
                          </div>
                          {option.description && (
                            <p className="text-xs text-muted-foreground">
                              {option.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Custom "Type something" option */}
                  {(() => {
                    const isCustomSelected = question.multiSelect
                      ? ((selections[qIdx] as string[]) || []).includes(CUSTOM_OPTION_LABEL)
                      : selections[qIdx] === CUSTOM_OPTION_LABEL;

                    const customOptionIndex = question.options.length;

                    if (question.multiSelect) {
                      return (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!isPending) return;
                              handleMultiSelect(qIdx, CUSTOM_OPTION_LABEL, !isCustomSelected);
                              if (!isCustomSelected) {
                                setTimeout(() => customInputRefs.current[qIdx]?.focus(), 0);
                              }
                            }}
                            disabled={!isPending}
                            className={cn(
                              'flex items-start gap-3 p-2 rounded-lg border text-left transition-colors w-full',
                              !isPending && 'cursor-default opacity-70',
                              isCustomSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                                : 'border-border hover:border-blue-300'
                            )}
                          >
                            <div
                              className={cn(
                                'w-4 h-4 rounded border-2 mt-0.5 flex-shrink-0 flex items-center justify-center',
                                isCustomSelected
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-muted-foreground'
                              )}
                            >
                              {isCustomSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">Type something</span>
                                {isPending && questions.length === 1 && (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {customOptionIndex + 1}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </button>
                          <div className="pl-7">
                            <Input
                              ref={(el) => { customInputRefs.current[qIdx] = el; }}
                              type="text"
                              placeholder="Enter your answer..."
                              value={customTexts[qIdx] || ''}
                              onChange={(e) => handleCustomTextChange(qIdx, e.target.value)}
                              disabled={!isPending}
                              className={cn(
                                'text-sm',
                                isCustomSelected && 'border-blue-500 focus:ring-blue-500'
                              )}
                            />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isPending) return;
                            handleSingleSelect(qIdx, CUSTOM_OPTION_LABEL);
                            setTimeout(() => customInputRefs.current[qIdx]?.focus(), 0);
                          }}
                          disabled={!isPending}
                          className={cn(
                            'flex items-start gap-3 p-2 rounded-lg border text-left transition-colors w-full',
                            !isPending && 'cursor-default opacity-70',
                            isCustomSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                              : 'border-border hover:border-blue-300'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0',
                              isCustomSelected
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-muted-foreground'
                            )}
                          >
                            {isCustomSelected && (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">Type something</span>
                              {isPending && questions.length === 1 && (
                                <Badge variant="secondary" className="text-xs font-mono">
                                  {customOptionIndex + 1}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                        <div className="pl-7">
                          <Input
                            ref={(el) => { customInputRefs.current[qIdx] = el; }}
                            type="text"
                            placeholder="Enter your answer..."
                            value={customTexts[qIdx] || ''}
                            onChange={(e) => handleCustomTextChange(qIdx, e.target.value)}
                            disabled={!isPending}
                            className={cn(
                              'text-sm',
                              isCustomSelected && 'border-blue-500 focus:ring-blue-500'
                            )}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}

          {isPending && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {questions.length === 1 ? `Press 1-${questions[0].options.length + 1} to select` : ''}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAskInTerminal}
                  className="gap-1"
                >
                  <MessageSquare className="h-3 w-3" />
                  Ask in Terminal
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!isComplete}
                  className="gap-1"
                >
                  <Send className="h-3 w-3" />
                  Submit
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
