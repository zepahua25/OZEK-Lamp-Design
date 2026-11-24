import { GeneratedLampResult, LampConfig } from '../types/lamp';
import './families';
import { BuildOptions, generateLampGeometry } from './solidBuilder';

export interface WorkerRequest {
  id: number;
  config: LampConfig;
  options: BuildOptions;
}

export interface WorkerResponse {
  id: number;
  result?: GeneratedLampResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, config, options } = event.data;
  try {
    const result = generateLampGeometry(config, options);
    const transferables: Transferable[] = [];
    for (const part of result.parts) {
      transferables.push(
        part.positions.buffer,
        part.normals.buffer,
        part.indices.buffer,
        part.thickness.buffer,
        part.overhang.buffer
      );
    }
    const response: WorkerResponse = { id, result };
    (self as unknown as Worker).postMessage(response, transferables);
  } catch (err) {
    const response: WorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
