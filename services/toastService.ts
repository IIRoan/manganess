import { EventEmitter } from 'react-native';

export interface ToastConfig {
  message: string;
  icon?: string;
  duration?: number;
}

class ToastService {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  show(config: ToastConfig) {
    this.emitter.emit('show', config);
  }

  hide() {
    this.emitter.emit('hide');
  }

  on(event: string, listener: (data: any) => void) {
    this.emitter.addListener(event, listener);
  }

  off(event: string, listener: (data: any) => void) {
    this.emitter.removeListener(event, listener);
  }
}

export const toastService = new ToastService();
