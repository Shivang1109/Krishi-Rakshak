import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

// Change this to your machine's local IP when testing on a physical device
// e.g. 'http://192.168.1.5:8000'
const String kApiBase = 'http://10.0.2.2:8000'; // Android emulator → localhost
// For iOS simulator use: 'http://127.0.0.1:8000'

class PredictionResult {
  final String className;
  final String displayName;
  final double confidence;
  final String confidencePct;
  final String severity;
  final String severityColor;
  final String description;
  final List<String> symptoms;
  final List<String> treatment;
  final String prevention;
  final List<AlternativePrediction> alternatives;

  PredictionResult({
    required this.className,
    required this.displayName,
    required this.confidence,
    required this.confidencePct,
    required this.severity,
    required this.severityColor,
    required this.description,
    required this.symptoms,
    required this.treatment,
    required this.prevention,
    required this.alternatives,
  });

  factory PredictionResult.fromJson(Map<String, dynamic> json) {
    final top = json['top_prediction'] as Map<String, dynamic>;
    final topK = (json['top_k'] as List).skip(1).map((e) =>
        AlternativePrediction.fromJson(e as Map<String, dynamic>)).toList();

    return PredictionResult(
      className: top['class_name'] ?? '',
      displayName: top['display_name'] ?? '',
      confidence: (top['confidence'] as num).toDouble(),
      confidencePct: top['confidence_pct'] ?? '',
      severity: top['severity'] ?? 'unknown',
      severityColor: top['severity_color'] ?? '#8b5cf6',
      description: top['description'] ?? '',
      symptoms: List<String>.from(top['symptoms'] ?? []),
      treatment: List<String>.from(top['treatment'] ?? []),
      prevention: top['prevention'] ?? '',
      alternatives: topK,
    );
  }

  Color get severityColorValue {
    switch (severity) {
      case 'none':     return const Color(0xFF22C55E);
      case 'medium':   return const Color(0xFFF59E0B);
      case 'high':     return const Color(0xFFF97316);
      case 'critical': return const Color(0xFFEF4444);
      default:         return const Color(0xFF8B5CF6);
    }
  }

  String get severityLabel {
    switch (severity) {
      case 'none':     return 'HEALTHY';
      case 'medium':   return 'MODERATE';
      case 'high':     return 'SERIOUS';
      case 'critical': return 'CRITICAL';
      default:         return 'UNKNOWN';
    }
  }
}

class AlternativePrediction {
  final int rank;
  final String displayName;
  final double confidence;
  final String confidencePct;

  AlternativePrediction({
    required this.rank,
    required this.displayName,
    required this.confidence,
    required this.confidencePct,
  });

  factory AlternativePrediction.fromJson(Map<String, dynamic> json) {
    return AlternativePrediction(
      rank: json['rank'] ?? 0,
      displayName: json['display_name'] ?? '',
      confidence: (json['confidence'] as num).toDouble(),
      confidencePct: json['confidence_pct'] ?? '',
    );
  }
}

class ApiService {
  static Future<bool> checkHealth() async {
    try {
      final res = await http
          .get(Uri.parse('$kApiBase/health'))
          .timeout(const Duration(seconds: 5));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<PredictionResult> predict(File imageFile) async {
    final uri = Uri.parse('$kApiBase/predict');
    final request = http.MultipartRequest('POST', uri);
    request.files.add(
      await http.MultipartFile.fromPath('file', imageFile.path),
    );

    final streamedRes = await request.send().timeout(
      const Duration(seconds: 30),
    );
    final res = await http.Response.fromStream(streamedRes);

    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return PredictionResult.fromJson(json);
    } else {
      final err = jsonDecode(res.body);
      throw Exception(err['detail'] ?? 'Prediction failed');
    }
  }
}
