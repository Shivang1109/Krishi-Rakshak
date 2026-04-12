import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import 'result_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  File? _selectedImage;
  bool _isAnalyzing = false;
  bool _apiOnline = false;
  final _picker = ImagePicker();
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _checkApi();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _checkApi() async {
    final online = await ApiService.checkHealth();
    if (mounted) setState(() => _apiOnline = online);
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 90,
      maxWidth: 1024,
    );
    if (picked != null) {
      setState(() => _selectedImage = File(picked.path));
    }
  }

  Future<void> _analyzeImage() async {
    if (_selectedImage == null) return;
    setState(() => _isAnalyzing = true);
    try {
      final result = await ApiService.predict(_selectedImage!);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ResultScreen(
            result: result,
            imageFile: _selectedImage!,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: ${e.toString().replaceAll("Exception: ", "")}'),
          backgroundColor: const Color(0xFFEF4444),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    } finally {
      if (mounted) setState(() => _isAnalyzing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                _buildHeader(),
                const SizedBox(height: 28),
                _buildHeroSection(),
                const SizedBox(height: 28),
                _buildImageCard(),
                const SizedBox(height: 16),
                _buildActionButtons(),
                const SizedBox(height: 28),
                _buildCropsSection(),
                const SizedBox(height: 28),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return FadeInDown(
      duration: const Duration(milliseconds: 500),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF16A34A), Color(0xFF10B981)],
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF22C55E).withOpacity(0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Center(
              child: Text('🌾', style: TextStyle(fontSize: 24)),
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Krishi Rakshak',
                  style: GoogleFonts.outfit(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  )),
              Text('AI-Powered Crop Doctor',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: const Color(0xFF4ADE80),
                    letterSpacing: 0.5,
                  )),
            ],
          ),
          const Spacer(),
          _buildApiBadge(),
        ],
      ),
    );
  }

  Widget _buildApiBadge() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (_, __) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: (_apiOnline
                  ? const Color(0xFF22C55E)
                  : const Color(0xFFEF4444))
              .withOpacity(0.12),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: (_apiOnline
                    ? const Color(0xFF22C55E)
                    : const Color(0xFFEF4444))
                .withOpacity(0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _apiOnline
                    ? Color.lerp(
                        const Color(0xFF22C55E),
                        const Color(0xFF86EFAC),
                        _pulseController.value,
                      )
                    : const Color(0xFFEF4444),
              ),
            ),
            const SizedBox(width: 5),
            Text(
              _apiOnline ? 'Online' : 'Offline',
              style: GoogleFonts.outfit(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: _apiOnline
                    ? const Color(0xFF4ADE80)
                    : const Color(0xFFF87171),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroSection() {
    return FadeInUp(
      duration: const Duration(milliseconds: 600),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Protect Your\nCrops 🌿',
            style: GoogleFonts.outfit(
              fontSize: 36,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1.15,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Upload a crop photo and our AI instantly identifies diseases across 54 conditions.',
            style: GoogleFonts.inter(
              fontSize: 14,
              color: Colors.white.withOpacity(0.55),
              height: 1.6,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _statChip('54', 'Diseases'),
              const SizedBox(width: 10),
              _statChip('9', 'Crops'),
              const SizedBox(width: 10),
              _statChip('AI', 'Powered'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statChip(String value, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF16A34A).withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              style: GoogleFonts.outfit(
                fontWeight: FontWeight.w800,
                color: const Color(0xFF4ADE80),
                fontSize: 15,
              )),
          const SizedBox(width: 5),
          Text(label,
              style: GoogleFonts.inter(
                fontSize: 11,
                color: const Color(0xFF4ADE80).withOpacity(0.7),
              )),
        ],
      ),
    );
  }

  Widget _buildImageCard() {
    return FadeInUp(
      duration: const Duration(milliseconds: 700),
      child: GestureDetector(
        onTap: _selectedImage == null ? () => _showPickerSheet() : null,
        child: Container(
          width: double.infinity,
          height: 240,
          decoration: BoxDecoration(
            color: const Color(0xFF0C1C0F).withOpacity(0.85),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: _selectedImage != null
                  ? const Color(0xFF22C55E).withOpacity(0.4)
                  : const Color(0xFF22C55E).withOpacity(0.15),
              width: _selectedImage != null ? 1.5 : 1,
            ),
          ),
          child: _selectedImage == null
              ? _buildDropZoneEmpty()
              : _buildDropZonePreview(),
        ),
      ),
    );
  }

  Widget _buildDropZoneEmpty() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text('🌿', style: TextStyle(fontSize: 48)),
        const SizedBox(height: 16),
        Text('Tap to upload crop image',
            style: GoogleFonts.outfit(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            )),
        const SizedBox(height: 6),
        Text('JPEG or PNG • Max 10MB',
            style: GoogleFonts.inter(
              fontSize: 12,
              color: const Color(0xFF4ADE80).withOpacity(0.6),
            )),
      ],
    );
  }

  Widget _buildDropZonePreview() {
    return Stack(
      fit: StackFit.expand,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(23),
          child: Image.file(_selectedImage!, fit: BoxFit.cover),
        ),
        Positioned(
          top: 10,
          right: 10,
          child: GestureDetector(
            onTap: () => setState(() => _selectedImage = null),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.7),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close, color: Colors.white, size: 18),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButtons() {
    return FadeInUp(
      duration: const Duration(milliseconds: 800),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _outlineButton(
                  icon: Icons.photo_library_outlined,
                  label: 'Gallery',
                  onTap: () => _pickImage(ImageSource.gallery),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _outlineButton(
                  icon: Icons.camera_alt_outlined,
                  label: 'Camera',
                  onTap: () => _pickImage(ImageSource.camera),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: _selectedImage != null && !_isAnalyzing
                  ? _analyzeImage
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF16A34A),
                foregroundColor: Colors.white,
                disabledBackgroundColor:
                    const Color(0xFF16A34A).withOpacity(0.3),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: _isAnalyzing
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text('Analyzing…',
                            style: GoogleFonts.outfit(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            )),
                      ],
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text('🔬', style: TextStyle(fontSize: 18)),
                        const SizedBox(width: 8),
                        Text('Analyze Disease',
                            style: GoogleFonts.outfit(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            )),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _outlineButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: const Color(0xFF22C55E).withOpacity(0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: const Color(0xFF22C55E).withOpacity(0.2),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: const Color(0xFF4ADE80)),
            const SizedBox(width: 8),
            Text(label,
                style: GoogleFonts.outfit(
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF4ADE80),
                  fontSize: 14,
                )),
          ],
        ),
      ),
    );
  }

  Widget _buildCropsSection() {
    const crops = [
      '🍌 Banana', '🌶️ Chilli', '🌽 Corn', '🥭 Mango',
      '🌾 Paddy', '🥔 Potato', '🎋 Sugarcane', '🍅 Tomato', '🌾 Wheat',
    ];
    return FadeInUp(
      duration: const Duration(milliseconds: 900),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF0C1C0F).withOpacity(0.85),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: const Color(0xFF22C55E).withOpacity(0.12),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('🌱 Supported Crops',
                style: GoogleFonts.outfit(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                )),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: crops
                  .map((c) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(
                          color: const Color(0xFF16A34A).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color:
                                const Color(0xFF22C55E).withOpacity(0.2),
                          ),
                        ),
                        child: Text(c,
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              color:
                                  const Color(0xFF86EFAC),
                            )),
                      ))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }

  void _showPickerSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0C1C0F),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            Text('Choose Image Source',
                style: GoogleFonts.outfit(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                )),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _sheetOption(
                    icon: Icons.photo_library,
                    label: 'Gallery',
                    onTap: () {
                      Navigator.pop(context);
                      _pickImage(ImageSource.gallery);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _sheetOption(
                    icon: Icons.camera_alt,
                    label: 'Camera',
                    onTap: () {
                      Navigator.pop(context);
                      _pickImage(ImageSource.camera);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _sheetOption({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 90,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              const Color(0xFF16A34A).withOpacity(0.2),
              const Color(0xFF10B981).withOpacity(0.1),
            ],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: const Color(0xFF22C55E).withOpacity(0.25),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: const Color(0xFF4ADE80), size: 32),
            const SizedBox(height: 8),
            Text(label,
                style: GoogleFonts.outfit(
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF4ADE80),
                )),
          ],
        ),
      ),
    );
  }
}
