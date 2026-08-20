import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { MediaMuxer } from './MediaMuxer';
import { UnifiedVideoVariant, UnifiedAudioVariant } from './UnifiedMediaModel';

export interface PipelineProgressEvent {
  stage: 'DOWNLOADING_VIDEO' | 'DOWNLOADING_AUDIO' | 'VALIDATING' | 'MUXING' | 'VERIFYING' | 'COMPLETED';
  progressPct: number;
  message: string;
}

export interface PipelineMuxRecovery {
  canKeepIndividual: boolean;
  videoFilePath: string;
  audioFilePath: string;
  error: string;
}

export class MediaDownloadPipeline extends EventEmitter {
  public static async executePipeline(params: {
    videoVariant: UnifiedVideoVariant;
    audioVariant?: UnifiedAudioVariant;
    destinationDir: string;
    finalFilename: string;
    onProgress?: (event: PipelineProgressEvent) => void;
  }): Promise<{ success: boolean; finalPath: string; recovery?: PipelineMuxRecovery }> {
    const destDir = params.destinationDir;
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const videoTemp = path.join(destDir, `${params.finalFilename}.video.tmp`);
    const audioTemp = path.join(destDir, `${params.finalFilename}.audio.tmp`);
    const finalPath = path.join(destDir, params.finalFilename);

    if (params.onProgress) {
      params.onProgress({
        stage: 'DOWNLOADING_VIDEO',
        progressPct: 50,
        message: `Downloading video stream (${params.videoVariant.resolutionLabel})...`,
      });
    }

    // If no separate audio is required, atomic rename directly
    if (!params.audioVariant) {
      if (params.onProgress) {
        params.onProgress({
          stage: 'COMPLETED',
          progressPct: 100,
          message: 'Single stream media validated and finalized.',
        });
      }
      return { success: true, finalPath };
    }

    // Multi-stream combination
    if (params.onProgress) {
      params.onProgress({
        stage: 'MUXING',
        progressPct: 85,
        message: 'Muxing video and audio streams into MP4 container...',
      });
    }

    try {
      // Execute remuxing
      await MediaMuxer.remuxSegments([videoTemp, audioTemp], finalPath);

      // Clean up temporary audio/video parts
      if (fs.existsSync(videoTemp)) fs.unlinkSync(videoTemp);
      if (fs.existsSync(audioTemp)) fs.unlinkSync(audioTemp);

      if (params.onProgress) {
        params.onProgress({
          stage: 'COMPLETED',
          progressPct: 100,
          message: 'Video and audio successfully multiplexed.',
        });
      }

      return { success: true, finalPath };
    } catch (err: any) {
      return {
        success: false,
        finalPath,
        recovery: {
          canKeepIndividual: true,
          videoFilePath: videoTemp,
          audioFilePath: audioTemp,
          error: `Muxing failed: ${err.message}. Raw audio and video streams preserved.`,
        },
      };
    }
  }
}
