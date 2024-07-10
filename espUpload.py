import argparse
import esptool

def main(port, firmware_paths, flash_offsets, baud_rate=115200, chip='esp32', 
         before='default_reset', after='hard_reset', flash_mode='dio', flash_freq='80m', flash_size='detect'):
    # Ensure firmware_paths and flash_offsets are provided and of the same length
    if not firmware_paths or not flash_offsets or len(firmware_paths) != len(flash_offsets):
        print("Error: firmware_paths and flash_offsets must be provided and have the same length.")
        return

    # Create an argument list for esptool
    args = [
        '--chip', chip,
        '--port', port,
        '--baud', str(baud_rate),
        '--before', before,
        '--after', after,
        'write_flash', '-z',
        '--flash_mode', flash_mode,
        '--flash_freq', flash_freq,
        '--flash_size', flash_size
    ]
    
    # Add pairs of flash_offset and firmware_path to the argument list
    for offset, path in zip(flash_offsets, firmware_paths):
        args.extend([offset, path])

    # Parse arguments and execute the command
    esptool.main(args)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Upload firmware to ESP32.')
    parser.add_argument('--port', type=str, default='/dev/ttyUSB0', help='Serial port connected to ESP32')
    parser.add_argument('--baud', type=int, default=115200, help='Baud rate for serial communication')
    parser.add_argument('--firmware_paths', type=str, nargs='+', required=True, help='Paths to firmware binaries')
    parser.add_argument('--flash_offsets', type=str, nargs='+', required=True, help='Offsets in flash memory to write firmware')
    parser.add_argument('--chip', type=str, default='esp32', help='Target chip (default: esp32)')
    parser.add_argument('--before', type=str, default='default_reset', help='Action before flashing (default: default_reset)')
    parser.add_argument('--after', type=str, default='hard_reset', help='Action after flashing (default: hard_reset)')
    parser.add_argument('--flash_mode', type=str, default='dio', help='Flash mode (default: dio)')
    parser.add_argument('--flash_freq', type=str, default='80m', help='Flash frequency (default: 80m)')
    parser.add_argument('--flash_size', type=str, default='detect', help='Flash size (default: detect)')

    args = parser.parse_args()
    
    main(args.port, args.firmware_paths, args.flash_offsets, args.baud, args.chip, 
         args.before, args.after, args.flash_mode, args.flash_freq, args.flash_size)
