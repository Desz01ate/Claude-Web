'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { respondToQuestion, respondToPermission } from '@/lib/socket';
import type { PermissionRequestContent, AskUserQuestionInput } from '@/types';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Send,
  MessageSquare,
  CheckCircle,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionCardProps {
  sessionId: string;
  content: PermissionRequestContent;
}

export function QuestionCard({ sessionId, content }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [localStatus, setLocalStatus] = useState(content.status);
  const isPending = localStatus === 'pending';

  const input = content.toolInput as AskUserQuestionInput | undefined;
  const questions = input?.questions || [];

  // Track selected answers
  const [selections, setSelections] = useState<Record<number, string | string[]>>({});

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

  // Sync local status with prop changes
  useEffect(() => {
    setLocalStatus(content.status);
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

  const handleSubmit = useCallback(() => {
    const answers: Record<string, string> = {};
    questions.forEach((q, idx) => {
      const selection = selections[idx];
      if (q.multiSelect) {
        answers[q.question] = (selection as string[]).join(', ');
      } else {
        answers[q.question] = selection as string;
      }
    });

    respondToQuestion(sessionId, content.toolUseId, answers);
    setLocalStatus('answered');
  }, [sessionId, content.toolUseId, questions, selections]);

  const handleAskInTerminal = useCallback(() => {
    respondToPermission(sessionId, content.toolUseId, 'ask');
    setLocalStatus('asked');
  }, [sessionId, content.toolUseId]);

  const isComplete = questions.every((q, idx) => {
    const selection = selections[idx];
    if (q.multiSelect) {
      return (selection as string[])?.length > 0;
    }
    return !!selection;
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
              </div>
            </div>
          ))}

          {isPending && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {questions.length === 1 ? 'Press 1-4 to select' : ''}
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
