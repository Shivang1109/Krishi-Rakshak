import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';

class ResultScreen extends StatefulWidget {
  final PredictionResult result;
  final File imageFile;

  const ResultScreen({
    super.key,
    required this.result,
    required this.imageFile,
  });

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  int _selectedTab = 0;
  final List<String> _tabs = ['Symptoms', 'Treatment', 'Prevention', 'Others'];

  void _shareOnWhatsApp() {
    final r = widget.result;
    final pct = (r.confidence * 100).round();
    final treat = r.treatment.take(3).join('\n');
    final text =
        'Krishi Rakshak Diagnosis 🌾\n\nDisease: ${r.displayName}\nSeverity: ${r.severityLabel}\nConfidence: $pct%\n\nTreatment:\n$treat\n\nKrishi Rakshak AI';
    final encoded = Uri.encodeComponent(text);
    final url = 'https://wa.me/?text=$encoded';
    // Copy to clipboard as fallback (url_launcher not in deps)
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(children: [
          const Text('📋 '),
          Expanded(child: Text('Diagnosis copied! Open WhatsApp and paste to share.',
              style: GoogleFonts.inter(fontSize: 13))),
        ]),
        backgroundColor: const Color(0xFF25D366),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        action: SnackBarAction(
          label: 'OK',
          textColor: Colors.white,
          onPressed: () {},
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.result;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF050F07), Color(0xFF0C1C0F), Color(0xFF050F07)],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            child: Column(
              children: [
                _buildTopBar(context),
                _buildImageSection(),
                _buildResultBanner(r),
                const SizedBox(height: 20),
                _buildTabs(),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: _buildTabContent(r),
                ),
                const SizedBox(height: 32),
              _buildShareBar(),
              const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.12)),
              ),
              child: const Icon(Icons.arrow_back_ios_new,
                  color: Colors.white, size: 16),
            ),
          ),
          const SizedBox(width: 12),
          Text('Analysis Result',
              style: GoogleFonts.outfit(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              )),
        ],
      ),
    );
  }

  Widget _buildImageSection() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: FadeInDown(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Image.file(
            widget.imageFile,
            height: 200,
            width: double.infinity,
            fit: BoxFit.cover,
          ),
        ),
      ),
    );
  }

  Widget _buildResultBanner(PredictionResult r) {
    final color = r.severityColorValue;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: FadeInUp(
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: color.withOpacity(0.07),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withOpacity(0.3)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: color.withOpacity(0.4)),
                      ),
                      child: Text(r.severityLabel,
                          style: GoogleFonts.outfit(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: color,
                            letterSpacing: 0.6,
                          )),
                    ),
                    const SizedBox(height: 10),
                    Text(r.displayName,
                        style: GoogleFonts.outfit(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          height: 1.25,
                        )),
                    const SizedBox(height: 6),
                    Text(r.description,
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: Colors.white.withOpacity(0.55),
                          height: 1.5,
                        )),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _buildConfidenceRing(r),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildConfidenceRing(PredictionResult r) {
    final pct = (r.confidence * 100).round();
    final color = r.severityColorValue;
    return SizedBox(
      width: 78,
      height: 78,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 78,
            height: 78,
            child: CircularProgressIndicator(
              value: r.confidence,
              strokeWidth: 6,
              backgroundColor: color.withOpacity(0.15),
              valueColor: AlwaysStoppedAnimation<Color>(color),
              strokeCap: StrokeCap.round,
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('$pct%',
                  style: GoogleFonts.outfit(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: color,
                  )),
              Text('conf',
                  style: GoogleFonts.inter(
                    fontSize: 9,
                    color: color.withOpacity(0.7),
                    letterSpacing: 0.4,
                  )),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: List.generate(_tabs.length, (i) {
          final active = i == _selectedTab;
          return GestureDetector(
            onTap: () => setState(() => _selectedTab = i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 8),
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
              decoration: BoxDecoration(
                gradient: active
                    ? const LinearGradient(
                        colors: [Color(0xFF16A34A), Color(0xFF10B981)])
                    : null,
                color: active
                    ? null
                    : const Color(0xFF22C55E).withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: active
                      ? Colors.transparent
                      : const Color(0xFF22C55E).withOpacity(0.15),
                ),
                boxShadow: active
                    ? [
                        BoxShadow(
                          color: const Color(0xFF22C55E).withOpacity(0.25),
                          blurRadius: 12,
                        )
                      ]
                    : null,
              ),
              child: Text(_tabs[i],
                  style: GoogleFonts.outfit(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: active
                        ? Colors.white
                        : const Color(0xFF4ADE80),
                  )),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildTabContent(PredictionResult r) {
    switch (_selectedTab) {
      case 0:
        return _buildListItems(
            r.symptoms.isEmpty
                ? ['No specific symptoms detected — crop appears healthy.']
                : r.symptoms,
            isSymptom: true);
      case 1:
        return _buildListItems(r.treatment, isSymptom: false);
      case 2:
        return _buildPreventionBox(r.prevention);
      case 3:
        return _buildAlternatives(r.alternatives);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildListItems(List<String> items, {required bool isSymptom}) {
    return Column(
      children: items.asMap().entries.map((entry) {
        final i = entry.key;
        final text = entry.value;
        return FadeInUp(
          delay: Duration(milliseconds: 60 * i),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF0C1C0F),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFF22C55E).withOpacity(0.12),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(isSymptom ? '⚠️' : '✅',
                    style: const TextStyle(fontSize: 14)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(text,
                      style: GoogleFonts.inter(
                        fontSize: 13.5,
                        color: Colors.white.withOpacity(0.82),
                        height: 1.5,
                      )),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildPreventionBox(String text) {
    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: const Color(0xFF14B8A6).withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0xFF14B8A6).withOpacity(0.2),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('🛡️ Prevention Tip',
                style: GoogleFonts.outfit(
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF14B8A6),
                  fontSize: 14,
                )),
            const SizedBox(height: 10),
            Text(text,
                style: GoogleFonts.inter(
                  fontSize: 13.5,
                  color: Colors.white.withOpacity(0.8),
                  height: 1.65,
                )),
          ],
        ),
      ),
    );
  }

  Widget _buildAlternatives(List<AlternativePrediction> alts) {
    if (alts.isEmpty) {
      return Center(
        child: Text('No alternatives',
            style: GoogleFonts.inter(
                color: Colors.white38, fontSize: 13)),
      );
    }
    return Column(
      children: alts.asMap().entries.map((entry) {
        final i = entry.key;
        final alt = entry.value;
        final pct = (alt.confidence * 100).round();
        return FadeInUp(
          delay: Duration(milliseconds: 80 * i),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF0C1C0F),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFF22C55E).withOpacity(0.12),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(alt.displayName,
                          style: GoogleFonts.inter(
                            fontSize: 13.5,
                            color: Colors.white.withOpacity(0.82),
                          )),
                    ),
                    Text(alt.confidencePct,
                        style: GoogleFonts.outfit(
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF4ADE80),
                          fontSize: 13,
                        )),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: alt.confidence,
                    backgroundColor:
                        const Color(0xFF22C55E).withOpacity(0.12),
                    valueColor: const AlwaysStoppedAnimation(
                        Color(0xFF22C55E)),
                    minHeight: 5,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildShareBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: _shareOnWhatsApp,
              child: Container(
                height: 50,
                decoration: BoxDecoration(
                  color: const Color(0xFF25D366).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: const Color(0xFF25D366).withOpacity(0.3),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('📱', style: TextStyle(fontSize: 18)),
                    const SizedBox(width: 8),
                    Text('Share on WhatsApp',
                        style: GoogleFonts.outfit(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF25D366),
                          fontSize: 14,
                        )),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              height: 50,
              width: 50,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
              ),
              child: const Icon(Icons.refresh_rounded,
                  color: Colors.white70, size: 22),
            ),
          ),
        ],
      ),
    );
  }
}
