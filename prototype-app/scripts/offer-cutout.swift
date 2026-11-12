import CoreImage
import Foundation
import Vision

let input = FileHandle.standardInput.readDataToEndOfFile()
let handler = VNImageRequestHandler(data: input)
let request = VNGenerateForegroundInstanceMaskRequest()
do {
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else { exit(2) }
    let masked = try observation.generateMaskedImage(
        ofInstances: observation.allInstances,
        from: handler,
        croppedToInstancesExtent: false
    )
    let image = CIImage(cvPixelBuffer: masked)
    guard let png = CIContext().pngRepresentation(
        of: image, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
    ) else { exit(2) }
    try FileHandle.standardOutput.write(contentsOf: png)
} catch {
    exit(2)
}
