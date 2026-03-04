/**
 * Error boundary — catches render crashes and shows a friendly fallback.
 * React error boundaries must be class components.
 */

import React, { Component, ErrorInfo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  retryCount: number;
}

const MAX_RETRIES = 2;

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState(prev => ({
      hasError: false,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const canRetry = this.state.retryCount < MAX_RETRIES;
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>:(</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {canRetry
              ? (this.props.fallbackMessage || 'An unexpected error occurred.')
              : 'This keeps happening. Please close and reopen the app.'}
          </Text>
          {canRetry && (
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={this.handleRetry}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emoji: {
    fontSize: 48,
    color: Colors.text.muted,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  button: {
    backgroundColor: Colors.brand,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: Colors.text.inverse,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
