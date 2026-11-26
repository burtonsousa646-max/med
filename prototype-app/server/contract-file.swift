import Foundation
import AppKit
import PDFKit
import Vision
import ImageIO

func readText(_ image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ru-RU", "en-US"]
    try VNImageRequestHandler(cgImage: image).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}
let url = URL(fileURLWithPath: CommandLine.arguments[1])
if url.pathExtension == "pdf", let document = PDFDocument(url: url) {
    for index in 0..<min(5, document.pageCount) {
        guard let page = document.page(at: index) else { continue }
        if let text = page.string, text.range(of: "[А-Яа-яЁё]{2}", options: .regularExpression) != nil {
            print(text)
        } else {
            let image = page.thumbnail(of: NSSize(width: 1800, height: 1800), for: .mediaBox)
            if let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) { print(try readText(cg)) }
        }
    }
} else if let source = CGImageSourceCreateWithURL(url as CFURL, nil) {
    let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways:true,
        kCGImageSourceCreateThumbnailWithTransform:true, kCGImageSourceThumbnailMaxPixelSize:2400]
    if let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) { print(try readText(cg)) }
}
